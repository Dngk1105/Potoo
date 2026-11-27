-- START_SHOT state is private to server-side transactions.
create table public.k407_shot_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  session_id uuid,
  generation bigint not null default 0 check (generation between 0 and 9007199254740991),
  created_at timestamptz not null default clock_timestamp()
);
create table public.k407_shot_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  session_id uuid not null,
  host_id uuid not null,
  generation bigint not null,
  request_id uuid not null,
  round integer not null check (round >= 0),
  delay_ms integer not null check (delay_ms between 0 and 60000),
  issued_ms bigint not null,
  expires_ms bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (room_id, request_id),
  unique (session_id, round)
);
create table public.k407_shot_claims (
  event_id uuid not null references public.k407_shot_events(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (event_id, user_id)
);
alter table public.k407_shot_state enable row level security;
alter table public.k407_shot_events enable row level security;
alter table public.k407_shot_claims enable row level security;
revoke all on public.k407_shot_state, public.k407_shot_events, public.k407_shot_claims from public, anon, authenticated, service_role;

-- Lock the room before updating the generation; cascaded room deletion may have removed it.
create function public.k407_invalidate(p_room uuid, p_clear_session uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.rooms where id = p_room for update;
  if not found then return; end if;
  insert into public.k407_shot_state(room_id, generation) values (p_room, 1)
  on conflict (room_id) do update set
    generation = public.k407_shot_state.generation + 1,
    session_id = case when public.k407_shot_state.session_id = p_clear_session
      then null else public.k407_shot_state.session_id end;
end $$;

create function public.k407_room_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.host_id is distinct from new.host_id or old.status is distinct from new.status then
    perform public.k407_invalidate(new.id);
  end if;
  return new;
end $$;
create trigger k407_room_changed after update of host_id, status on public.rooms
for each row execute function public.k407_room_changed();

create function public.k407_member_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.k407_invalidate(new.room_id);
  elsif tg_op = 'DELETE' then
    perform public.k407_invalidate(old.room_id);
  elsif old is distinct from new then
    if old.room_id = new.room_id then
      perform public.k407_invalidate(old.room_id);
    elsif old.room_id < new.room_id then
      perform public.k407_invalidate(old.room_id);
      perform public.k407_invalidate(new.room_id);
    else
      perform public.k407_invalidate(new.room_id);
      perform public.k407_invalidate(old.room_id);
    end if;
  end if;
  return null;
end $$;
create trigger k407_member_changed after insert or update or delete on public.room_members
for each row execute function public.k407_member_changed();

create function public.k407_session_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform public.k407_invalidate(old.room_id, old.id);
  elsif old.id is distinct from new.id or old.room_id is distinct from new.room_id
     or old.started_at is distinct from new.started_at then
    if old.room_id = new.room_id then
      perform public.k407_invalidate(old.room_id, old.id);
    elsif old.room_id < new.room_id then
      perform public.k407_invalidate(old.room_id, old.id);
      perform public.k407_invalidate(new.room_id);
    else
      perform public.k407_invalidate(new.room_id);
      perform public.k407_invalidate(old.room_id, old.id);
    end if;
  end if;
  return null;
end $$;
create trigger k407_session_changed after update or delete on public.sessions
for each row execute function public.k407_session_changed();

-- TRUNCATE does not invoke row triggers and would otherwise bypass invalidation.
create function public.k407_no_truncate() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'TRUNCATE is not supported for START_SHOT source tables' using errcode = '0A000';
end $$;
create trigger k407_no_truncate before truncate on public.rooms for each statement execute function public.k407_no_truncate();
create trigger k407_no_truncate before truncate on public.room_members for each statement execute function public.k407_no_truncate();
create trigger k407_no_truncate before truncate on public.sessions for each statement execute function public.k407_no_truncate();

create function public.k407_select_shot_session(p_actor uuid, p_room uuid, p_session uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; s public.k407_shot_state%rowtype;
begin
  if p_actor is null or p_room is null then return jsonb_build_object('code','INVALID_REQUEST'); end if;
  select * into r from public.rooms where id = p_room for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if r.host_id is distinct from p_actor or not exists (select 1 from public.room_members where room_id=p_room and user_id=p_actor and kicked_at is null) then
    return jsonb_build_object('code','FORBIDDEN');
  end if;
  if r.status <> 'open' then return jsonb_build_object('code','CONFLICT'); end if;
  if p_session is not null and not exists (select 1 from public.sessions where id=p_session and room_id=p_room and started_at is not null) then
    return jsonb_build_object('code','CONFLICT');
  end if;
  insert into public.k407_shot_state(room_id) values (p_room) on conflict do nothing;
  select * into s from public.k407_shot_state where room_id=p_room for update;
  if s.session_id is distinct from p_session then
    update public.k407_shot_state set session_id=p_session, generation=generation+1 where room_id=p_room returning * into s;
  end if;
  return jsonb_build_object('code','OK','sessionId',s.session_id,'generation',s.generation);
end $$;

create function public.k407_issue_start_shot(p_actor uuid, p_room uuid, p_session uuid, p_request uuid, p_round integer, p_delay_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; s public.k407_shot_state%rowtype; e public.k407_shot_events%rowtype; ms bigint;
begin
  if p_actor is null or p_room is null or p_session is null or p_request is null or p_round is null or p_round < 0 or p_delay_ms is null or p_delay_ms not between 0 and 60000 then
    return jsonb_build_object('code','INVALID_REQUEST');
  end if;
  select * into r from public.rooms where id=p_room for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if r.host_id is distinct from p_actor or not exists (select 1 from public.room_members where room_id=p_room and user_id=p_actor and kicked_at is null) then return jsonb_build_object('code','FORBIDDEN'); end if;
  if r.status <> 'open' then return jsonb_build_object('code','CONFLICT'); end if;
  select * into s from public.k407_shot_state where room_id=p_room for update;
  if not found or s.session_id is distinct from p_session or not exists (select 1 from public.sessions where id=p_session and room_id=p_room and started_at is not null) then return jsonb_build_object('code','CONFLICT'); end if;
  select * into e from public.k407_shot_events where room_id=p_room and request_id=p_request;
  if found then
    if e.session_id <> p_session or e.host_id <> p_actor or e.round <> p_round or e.delay_ms <> p_delay_ms then return jsonb_build_object('code','CONFLICT'); end if;
    if e.generation <> s.generation then return jsonb_build_object('code','STALE'); end if;
    if e.expires_ms <= floor(extract(epoch from clock_timestamp())*1000)::bigint then return jsonb_build_object('code','EXPIRED'); end if;
  else
    if exists (select 1 from public.k407_shot_events where session_id=p_session and round=p_round) then return jsonb_build_object('code','CONFLICT'); end if;
    ms := floor(extract(epoch from clock_timestamp())*1000)::bigint;
    insert into public.k407_shot_events(room_id,session_id,host_id,generation,request_id,round,delay_ms,issued_ms,expires_ms)
      values(p_room,p_session,p_actor,s.generation,p_request,p_round,p_delay_ms,ms,ms+30000) returning * into e;
  end if;
  return jsonb_build_object('code','OK','version',1,'eventId',e.id,'requestId',e.request_id,'roomId',e.room_id,'sessionId',e.session_id,'hostId',e.host_id,'generation',e.generation,'round',e.round,'delayMs',e.delay_ms,'issuedAt',e.issued_ms,'expiresAt',e.expires_ms);
end $$;

create function public.k407_claim_start_shot(p_actor uuid, p_room uuid, p_event uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; s public.k407_shot_state%rowtype; e public.k407_shot_events%rowtype;
begin
  if p_actor is null or p_room is null or p_event is null then return jsonb_build_object('code','INVALID_REQUEST'); end if;
  select * into r from public.rooms where id=p_room for update;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  select * into s from public.k407_shot_state where room_id=p_room for update;
  if not found then return jsonb_build_object('code','STALE'); end if;
  select * into e from public.k407_shot_events where id=p_event and room_id=p_room;
  if not found then return jsonb_build_object('code','NOT_FOUND'); end if;
  if r.status <> 'open' or r.host_id is distinct from e.host_id or s.generation <> e.generation or s.session_id is distinct from e.session_id
     or not exists (select 1 from public.sessions where id=e.session_id and room_id=p_room and started_at is not null)
     or not exists (select 1 from public.room_members where room_id=p_room and user_id=e.host_id and kicked_at is null) then return jsonb_build_object('code','STALE'); end if;
  if not exists (select 1 from public.room_members where room_id=p_room and user_id=p_actor and kicked_at is null) then return jsonb_build_object('code','FORBIDDEN'); end if;
  if e.expires_ms <= floor(extract(epoch from clock_timestamp())*1000)::bigint then return jsonb_build_object('code','EXPIRED'); end if;
  insert into public.k407_shot_claims(event_id,user_id) values(p_event,p_actor) on conflict do nothing;
  if not found then return jsonb_build_object('code','REPLAY'); end if;
  return jsonb_build_object('code','OK','version',1,'eventId',e.id,'requestId',e.request_id,'roomId',e.room_id,'sessionId',e.session_id,'hostId',e.host_id,'generation',e.generation,'round',e.round,'delayMs',e.delay_ms,'issuedAt',e.issued_ms,'expiresAt',e.expires_ms);
end $$;

revoke all on function public.k407_invalidate(uuid,uuid), public.k407_room_changed(), public.k407_member_changed(), public.k407_session_changed(), public.k407_no_truncate(), public.k407_select_shot_session(uuid,uuid,uuid), public.k407_issue_start_shot(uuid,uuid,uuid,uuid,integer,integer), public.k407_claim_start_shot(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.k407_select_shot_session(uuid,uuid,uuid), public.k407_issue_start_shot(uuid,uuid,uuid,uuid,integer,integer), public.k407_claim_start_shot(uuid,uuid,uuid) to service_role;
