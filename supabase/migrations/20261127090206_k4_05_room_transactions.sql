-- Only the trusted server may supply an actor identity to these functions.
create function public.k405_create_room(p_actor uuid, p_pin text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  if p_actor is null or p_pin is null or p_pin !~ '^[0-9]{6}$' then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  insert into public.rooms (host_id, pin) values (p_actor, p_pin) returning id into v_room_id;
  insert into public.room_members (room_id, user_id) values (v_room_id, p_actor);
  return v_room_id;
end;
$$;

-- Membership is created by server transactions; a kicked user must not erase the tombstone.
drop policy room_members_insert on public.room_members;
drop policy room_members_delete on public.room_members;

create function public.k405_join_room(p_actor uuid, p_room_id uuid, p_pin text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_kicked timestamptz;
begin
  if p_actor is null or ((p_room_id is null) = (p_pin is null))
     or (p_pin is not null and p_pin !~ '^[0-9]{6}$') then
    raise exception 'Invalid input' using errcode = '22023';
  end if;

  select * into v_room from public.rooms
    where (p_room_id is not null and id = p_room_id)
       or (p_pin is not null and pin = p_pin and status <> 'ended')
    for update;
  if not found then return jsonb_build_object('code', 'NOT_FOUND'); end if;
  if v_room.status <> 'open' then return jsonb_build_object('code', 'CONFLICT'); end if;

  select kicked_at into v_kicked from public.room_members
    where room_id = v_room.id and user_id = p_actor for update;
  if found then
    if v_kicked is not null then return jsonb_build_object('code', 'FORBIDDEN'); end if;
  else
    insert into public.room_members (room_id, user_id) values (v_room.id, p_actor);
  end if;
  return jsonb_build_object('roomId', v_room.id);
end;
$$;

revoke all on function public.k405_create_room(uuid, text) from public, anon, authenticated;
revoke all on function public.k405_join_room(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.k405_create_room(uuid, text) to service_role;
grant execute on function public.k405_join_room(uuid, uuid, text) to service_role;
