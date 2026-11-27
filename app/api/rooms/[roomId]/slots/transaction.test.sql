-- Run with every pending migration inside BEGIN ... ROLLBACK; never commit this fixture.
insert into auth.users (id, email) values
  ('fa000000-0000-4000-8000-000000000011', 'k405slots-host@example.invalid'),
  ('fa000000-0000-4000-8000-000000000012', 'k405slots-member@example.invalid'),
  ('fa000000-0000-4000-8000-000000000013', 'k405slots-kicked@example.invalid');

do $$
declare
  host uuid := 'fa000000-0000-4000-8000-000000000011';
  member uuid := 'fa000000-0000-4000-8000-000000000012';
  kicked uuid := 'fa000000-0000-4000-8000-000000000013';
  r uuid;
  f uuid;
  p text;
  result jsonb;
  assignments jsonb;
  kick_time timestamptz;
begin
  select lpad(n::text, 6, '0') into p from generate_series(0, 999999) n
    where not exists (select 1 from public.rooms where pin = lpad(n::text, 6, '0') and status <> 'ended') limit 1;
  r := public.k405_create_room(host, p);
  perform public.k405_join_room(member, r, null);
  perform public.k405_join_room(kicked, r, null);
  insert into public.assets (owner_id, kind, name, storage_path, manifest)
    values (host, 'frame', 'test', 'test', '{"version":1,"slots":[{},{}]}') returning id into f;
  update public.rooms set frame_id = f where id = r;
  assignments := jsonb_build_array(jsonb_build_object('userId', host, 'slotIndex', 0),
                                    jsonb_build_object('userId', member, 'slotIndex', 1));
  result := public.k405_set_slots(host, r, assignments);
  if result->'slots' <> assignments then raise exception 'set slots failed'; end if;
  if (select slot_index from public.room_members where room_id = r and user_id = member) <> 1 then raise exception 'slot missing'; end if;
  result := public.k405_set_slots(member, r, '[]');
  if result->>'code' <> 'FORBIDDEN' then raise exception 'member allowed'; end if;
  result := public.k405_set_slots(host, r, jsonb_build_array(jsonb_build_object('userId', member, 'slotIndex', 2)));
  if result->>'code' <> 'CONFLICT' then raise exception 'out of range accepted'; end if;
  if (select slot_index from public.room_members where room_id = r and user_id = member) <> 1 then raise exception 'failed mutation changed slots'; end if;
  result := public.k405_set_slots(host, r, jsonb_build_array(jsonb_build_object('userId', member, 'slotIndex', 0), jsonb_build_object('userId', host, 'slotIndex', 0)));
  if result->>'code' <> 'INVALID_REQUEST' then raise exception 'duplicate slot accepted'; end if;
  result := public.k405_kick(member, r, kicked);
  if result->>'code' <> 'FORBIDDEN' then raise exception 'non-host kick allowed'; end if;
  result := public.k405_kick(host, r, host);
  if result->>'code' <> 'CONFLICT' then raise exception 'host self-kick allowed'; end if;
  result := public.k405_kick(host, r, kicked);
  if result->>'kicked' <> 'true' then raise exception 'kick failed'; end if;
  select kicked_at into kick_time from public.room_members where room_id = r and user_id = kicked;
  result := public.k405_kick(host, r, kicked);
  if result->>'kicked' <> 'true' or (select kicked_at from public.room_members where room_id = r and user_id = kicked) is distinct from kick_time then raise exception 'kick retry changed tombstone'; end if;
  result := public.k405_join_room(kicked, r, null);
  if result->>'code' <> 'FORBIDDEN' then raise exception 'kicked member rejoined'; end if;
  result := public.k405_transfer_host(host, r, kicked);
  if result->>'code' <> 'CONFLICT' then raise exception 'kicked member became host'; end if;
  result := public.k405_transfer_host(member, r, member);
  if result->>'code' <> 'FORBIDDEN' then raise exception 'non-host transferred host'; end if;
  result := public.k405_transfer_host(host, r, member);
  if result->>'hostId' <> member::text then raise exception 'transfer failed'; end if;
  result := public.k405_transfer_host(host, r, member);
  if result->>'code' <> 'FORBIDDEN' then raise exception 'stale host transferred'; end if;
  result := public.k405_transfer_host(member, r, host);
  if result->>'hostId' <> host::text then raise exception 'transfer back failed'; end if;
  result := public.k405_set_slots(host, r, jsonb_build_array(jsonb_build_object('userId', kicked, 'slotIndex', 0)));
  if result->>'code' <> 'CONFLICT' then raise exception 'kicked member assigned'; end if;
  result := public.k405_leave_room(kicked, r);
  if result->>'code' <> 'FORBIDDEN' or not exists (select 1 from public.room_members where room_id = r and user_id = kicked and kicked_at is not null) then raise exception 'kick tombstone removed'; end if;
  result := public.k405_leave_room(host, r);
  if result->>'code' <> 'CONFLICT' then raise exception 'host allowed to leave'; end if;
  result := public.k405_leave_room(member, r);
  if result->>'left' <> 'true' or exists (select 1 from public.room_members where room_id = r and user_id = member) then raise exception 'member leave failed'; end if;
  result := public.k405_join_room(member, r, null);
  if result->>'roomId' <> r::text then raise exception 'rejoin failed'; end if;
  result := public.k405_set_slots(host, r, '[]');
  if result->'slots' <> '[]'::jsonb or exists (select 1 from public.room_members where room_id = r and slot_index is not null) then raise exception 'clear failed'; end if;
  update public.rooms set status = 'ended' where id = r;
  result := public.k405_set_slots(host, r, '[]');
  if result->>'code' <> 'CONFLICT' then raise exception 'ended accepted'; end if;
  if has_function_privilege('authenticated', 'public.k405_set_slots(uuid,uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.k405_leave_room(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.k405_kick(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.k405_transfer_host(uuid,uuid,uuid)', 'execute') then
    raise exception 'untrusted user can call RPC';
  end if;
end $$;
