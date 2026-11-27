-- Allow bounded room settings; the Route Handler performs recursive key validation.
create or replace function public.k405_patch_room(
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
     or (p_patch ? 'settings' and (
       jsonb_typeof(p_patch->'settings') <> 'object'
       or octet_length((p_patch->'settings')::text) > 32768
     ))
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
