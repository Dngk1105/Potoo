-- A round can be reissued only if its previous event is stale or expired and nobody claimed it.
create or replace function public.k407_issue_start_shot(p_actor uuid, p_room uuid, p_session uuid, p_request uuid, p_round integer, p_delay_ms integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; s public.k407_shot_state%rowtype; e public.k407_shot_events%rowtype; ms bigint; reason text;
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
  ms := floor(extract(epoch from clock_timestamp())*1000)::bigint;
  select * into e from public.k407_shot_events where room_id=p_room and request_id=p_request;
  if found then
    if e.session_id <> p_session or e.host_id <> p_actor or e.round <> p_round or e.delay_ms <> p_delay_ms then return jsonb_build_object('code','CONFLICT'); end if;
    reason := case when e.generation <> s.generation then 'STALE' when e.expires_ms <= ms then 'EXPIRED' else null end;
    if reason is not null then
      if exists (select 1 from public.k407_shot_claims where event_id=e.id) then return jsonb_build_object('code',reason); end if;
      delete from public.k407_shot_events where id=e.id;
      e := null;
    end if;
  else
    select * into e from public.k407_shot_events where session_id=p_session and round=p_round;
    if found then
      if e.generation = s.generation and e.expires_ms > ms then return jsonb_build_object('code','CONFLICT'); end if;
      if exists (select 1 from public.k407_shot_claims where event_id=e.id) then return jsonb_build_object('code','CONFLICT'); end if;
      delete from public.k407_shot_events where id=e.id;
      e := null;
    end if;
  end if;
  if e.id is null then
    insert into public.k407_shot_events(room_id,session_id,host_id,generation,request_id,round,delay_ms,issued_ms,expires_ms)
      values(p_room,p_session,p_actor,s.generation,p_request,p_round,p_delay_ms,ms,ms+30000) returning * into e;
  end if;
  return jsonb_build_object('code','OK','version',1,'eventId',e.id,'requestId',e.request_id,'roomId',e.room_id,'sessionId',e.session_id,'hostId',e.host_id,'generation',e.generation,'round',e.round,'delayMs',e.delay_ms,'issuedAt',e.issued_ms,'expiresAt',e.expires_ms);
end $$;
