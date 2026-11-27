-- Run after all pending migrations inside a transaction that is rolled back.
insert into auth.users (id, email) values
 ('cc331000-0000-4000-8000-000000000001', 'settings-host@example.invalid'),
 ('cc331000-0000-4000-8000-000000000002', 'settings-member@example.invalid');
do $$
declare
  host uuid := 'cc331000-0000-4000-8000-000000000001';
  other_user uuid := 'cc331000-0000-4000-8000-000000000002';
  room uuid;
  chosen_pin text;
  result jsonb;
begin
  select lpad(n::text, 6, '0') into chosen_pin from generate_series(0, 999999) n
    where not exists (select 1 from public.rooms r where r.pin = lpad(n::text, 6, '0') and r.status <> 'ended') limit 1;
  room := public.k405_create_room(host, chosen_pin);
  result := public.k405_patch_room(host, room, '{"settings":{"rounds":4,"countdown":{"seconds":3}}}'::jsonb);
  if result->'settings' <> '{"rounds":4,"countdown":{"seconds":3}}'::jsonb then
    raise exception 'Settings not persisted';
  end if;
  result := public.k405_patch_room(other_user, room, '{"settings":{"rounds":1}}'::jsonb);
  if result->>'code' <> 'FORBIDDEN' then raise exception 'Non-host accepted'; end if;
  result := public.k405_patch_room(host, room, jsonb_build_object('settings', jsonb_build_object('value', repeat('x', 32769))));
  if result->>'code' <> 'INVALID_REQUEST' then raise exception 'Oversized settings accepted'; end if;
end $$;
