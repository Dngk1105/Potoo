-- Existing claims keep a null request ID and cannot be replayed through v2.
alter table public.k407_shot_claims add column claim_request_id uuid;

create function public.k407_claim_start_shot_v2(p_actor uuid, p_room uuid, p_event uuid, p_claim_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.rooms%rowtype; s public.k407_shot_state%rowtype; e public.k407_shot_events%rowtype; previous_request uuid;
begin
  if p_actor is null or p_room is null or p_event is null or p_claim_request is null then return jsonb_build_object('code','INVALID_REQUEST'); end if;
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
  insert into public.k407_shot_claims(event_id,user_id,claim_request_id) values(p_event,p_actor,p_claim_request) on conflict do nothing;
  if not found then
    select claim_request_id into previous_request from public.k407_shot_claims where event_id=p_event and user_id=p_actor;
    if previous_request is distinct from p_claim_request then return jsonb_build_object('code','REPLAY'); end if;
  end if;
  return jsonb_build_object('code','OK','version',1,'eventId',e.id,'requestId',e.request_id,'roomId',e.room_id,'sessionId',e.session_id,'hostId',e.host_id,'generation',e.generation,'round',e.round,'delayMs',e.delay_ms,'issuedAt',e.issued_ms,'expiresAt',e.expires_ms);
end $$;
revoke all on function public.k407_claim_start_shot_v2(uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.k407_claim_start_shot_v2(uuid,uuid,uuid,uuid) to service_role;
