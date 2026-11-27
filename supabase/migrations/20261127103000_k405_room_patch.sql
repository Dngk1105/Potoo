-- Room mutations are serialized on the same row as k405_join_room.
-- Direct writes would bypass the validation and actor checks in server RPCs.
drop policy if exists rooms_update on public.rooms;
drop policy if exists room_members_update on public.room_members;

create function public.k405_patch_room(
  p_actor uuid, p_room_id uuid, p_patch jsonb
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_frame uuid;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_room.host_id is distinct from p_actor or not exists (
    select 1 from public.room_members where room_id = p_room_id
      and user_id = p_actor and kicked_at is null
  ) then return jsonb_build_object('code', 'FORBIDDEN'); end if;
  if v_room.status not in ('open', 'locked') then
    return jsonb_build_object('code', 'CONFLICT');
  end if;
  if jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
     or (p_patch - 'locked' - 'frameId' - 'settings') <> '{}'::jsonb
     or (p_patch ? 'locked' and jsonb_typeof(p_patch->'locked') <> 'boolean')
     or (p_patch ? 'settings' and p_patch->'settings' <> '{}'::jsonb)
     or (p_patch ? 'frameId' and jsonb_typeof(p_patch->'frameId') not in ('string', 'null')) then
    return jsonb_build_object('code', 'INVALID_REQUEST');
  end if;
  if p_patch ? 'frameId' then
    begin
      v_frame := (p_patch->>'frameId')::uuid;
    exception when invalid_text_representation then
      return jsonb_build_object('code', 'INVALID_REQUEST');
    end;
    if v_frame is not null and not exists (
      select 1 from public.assets where id = v_frame and kind = 'frame'
        and deleted_at is null and (visibility = 'public' or owner_id = p_actor)
    ) then return jsonb_build_object('code', 'CONFLICT'); end if;
    if v_frame is distinct from v_room.frame_id then
      update public.room_members set slot_index = null where room_id = p_room_id;
    end if;
  else
    v_frame := v_room.frame_id;
  end if;
  update public.rooms set
    status = case when p_patch ? 'locked' then
      case when (p_patch->>'locked')::boolean then 'locked' else 'open' end
      else status end,
    frame_id = v_frame,
    settings = case when p_patch ? 'settings' then p_patch->'settings' else settings end
    where id = p_room_id returning * into v_room;
  return jsonb_build_object('roomId', v_room.id, 'status', v_room.status,
    'frameId', v_room.frame_id, 'settings', v_room.settings);
end;
$$;
revoke all on function public.k405_patch_room(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.k405_patch_room(uuid, uuid, jsonb) to service_role;

-- Both operations use the room lock shared by join and frame changes.
create function public.k405_set_slots(p_actor uuid, p_room_id uuid, p_slots jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_room public.rooms%rowtype;
  v_manifest jsonb;
  v_slot jsonb;
  v_user uuid;
  v_index numeric;
  v_users uuid[] := array[]::uuid[];
  v_indices integer[] := array[]::integer[];
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_room.host_id is distinct from p_actor or not exists (
    select 1 from public.room_members where room_id = p_room_id
      and user_id = p_actor and kicked_at is null
  ) then return jsonb_build_object('code', 'FORBIDDEN'); end if;
  if v_room.status = 'ended' or v_room.frame_id is null then
    return jsonb_build_object('code', 'CONFLICT');
  end if;
  select manifest into v_manifest from public.assets
    where id = v_room.frame_id and kind = 'frame' and deleted_at is null for share;
  if not found or jsonb_typeof(v_manifest->'slots') is distinct from 'array' then
    return jsonb_build_object('code', 'CONFLICT');
  end if;
  if jsonb_typeof(p_slots) is distinct from 'array' then
    return jsonb_build_object('code', 'INVALID_REQUEST');
  end if;
  for v_slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(v_slot) is distinct from 'object'
       or (v_slot - 'userId' - 'slotIndex') <> '{}'::jsonb
       or jsonb_typeof(v_slot->'userId') is distinct from 'string'
       or jsonb_typeof(v_slot->'slotIndex') is distinct from 'number' then
      return jsonb_build_object('code', 'INVALID_REQUEST');
    end if;
    begin
      v_user := (v_slot->>'userId')::uuid;
      v_index := (v_slot->>'slotIndex')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return jsonb_build_object('code', 'INVALID_REQUEST');
    end;
    if v_index < 0 or v_index <> trunc(v_index)
       or v_index >= jsonb_array_length(v_manifest->'slots') then
      return jsonb_build_object('code', 'CONFLICT');
    end if;
    if v_user = any(v_users) or v_index::integer = any(v_indices) then
      return jsonb_build_object('code', 'INVALID_REQUEST');
    end if;
    if not exists (select 1 from public.room_members where room_id = p_room_id
      and user_id = v_user and kicked_at is null) then
      return jsonb_build_object('code', 'CONFLICT');
    end if;
    v_users := array_append(v_users, v_user);
    v_indices := array_append(v_indices, v_index::integer);
  end loop;
  update public.room_members set slot_index = null where room_id = p_room_id;
  update public.room_members m set slot_index = s.slot_index
    from unnest(v_users, v_indices) as s(user_id, slot_index)
    where m.room_id = p_room_id and m.user_id = s.user_id;
  return jsonb_build_object('slots', p_slots);
end;
$$;

-- A kicked membership is a tombstone. Host must transfer before leaving.
-- The trusted server must prevent real LiveKit participants from retaining access.
create function public.k405_leave_room(p_actor uuid, p_room_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_room public.rooms%rowtype;
  v_kicked timestamptz;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_room.host_id = p_actor then return jsonb_build_object('code', 'CONFLICT'); end if;
  select kicked_at into v_kicked from public.room_members
    where room_id = p_room_id and user_id = p_actor for update;
  if not found or v_kicked is not null then return jsonb_build_object('code', 'FORBIDDEN'); end if;
  delete from public.room_members where room_id = p_room_id and user_id = p_actor;
  return jsonb_build_object('left', true);
end;
$$;
revoke all on function public.k405_set_slots(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.k405_leave_room(uuid, uuid) from public, anon, authenticated;
grant execute on function public.k405_set_slots(uuid, uuid, jsonb) to service_role;
grant execute on function public.k405_leave_room(uuid, uuid) to service_role;

-- Trusted mock-mode caller only: real LiveKit requires external reconciliation.
create function public.k405_kick(p_actor uuid, p_room_id uuid, p_target uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_room.host_id is distinct from p_actor or not exists (
    select 1 from public.room_members where room_id = p_room_id
      and user_id = p_actor and kicked_at is null
  ) then return jsonb_build_object('code', 'FORBIDDEN'); end if;
  if v_room.status = 'ended' or p_target is null or p_target = p_actor then
    return jsonb_build_object('code', 'CONFLICT');
  end if;
  update public.room_members set kicked_at = coalesce(kicked_at, now()), slot_index = null
    where room_id = p_room_id and user_id = p_target;
  if not found then return jsonb_build_object('code', 'CONFLICT'); end if;
  return jsonb_build_object('userId', p_target, 'kicked', true);
end;
$$;

create function public.k405_transfer_host(p_actor uuid, p_room_id uuid, p_target uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_room public.rooms%rowtype;
begin
  select * into v_room from public.rooms where id = p_room_id for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_room.host_id is distinct from p_actor or not exists (
    select 1 from public.room_members where room_id = p_room_id
      and user_id = p_actor and kicked_at is null
  ) then return jsonb_build_object('code', 'FORBIDDEN'); end if;
  if v_room.status = 'ended' or p_target is null or p_target = p_actor or not exists (
    select 1 from public.room_members where room_id = p_room_id
      and user_id = p_target and kicked_at is null
  ) then return jsonb_build_object('code', 'CONFLICT'); end if;
  update public.rooms set host_id = p_target where id = p_room_id and host_id = p_actor;
  if not found then return jsonb_build_object('code', 'CONFLICT'); end if;
  return jsonb_build_object('hostId', p_target);
end;
$$;
revoke all on function public.k405_kick(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.k405_transfer_host(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.k405_kick(uuid, uuid, uuid) to service_role;
grant execute on function public.k405_transfer_host(uuid, uuid, uuid) to service_role;
