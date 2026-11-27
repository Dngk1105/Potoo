-- These functions accept an actor only from trusted server code.
create function public.k406_create_personal_strip(p_actor uuid, p_session uuid, p_canvas jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_strip uuid;
  v_room uuid;
begin
  if p_actor is null or p_session is null or p_canvas is null
      or jsonb_typeof(p_canvas) <> 'object' or not (p_canvas ? 'version') then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  select room_id into v_room from public.sessions where id = p_session;
  if v_room is null then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform 1 from public.room_members
    where room_id = v_room and user_id = p_actor and kicked_at is null for update;
  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  insert into public.strips (session_id, kind, created_by, canvas_json)
    values (p_session, 'personal', p_actor, p_canvas) returning id into v_strip;
  insert into public.strip_owners (strip_id, user_id) values (v_strip, p_actor);
  return v_strip;
end;
$$;
revoke all on function public.k406_create_personal_strip(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.k406_create_personal_strip(uuid, uuid, jsonb) to service_role;

create function public.k406_share_strip(p_actor uuid, p_strip uuid, p_token text)
returns text
language plpgsql security invoker set search_path = ''
as $$
declare
  v_token text;
begin
  if p_actor is null or p_strip is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid input' using errcode = '22023';
  end if;
  perform 1 from public.strips where id = p_strip for update;
  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  perform 1 from public.strip_owners where strip_id = p_strip and user_id = p_actor for update;
  if not found then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  update public.strips set share_token = coalesce(share_token, p_token)
    where id = p_strip returning share_token into v_token;
  return v_token;
end;
$$;
revoke all on function public.k406_share_strip(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.k406_share_strip(uuid, uuid, text) to service_role;
