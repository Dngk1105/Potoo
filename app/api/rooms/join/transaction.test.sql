-- Run only in a disposable transaction after loading the K4-05 migration.
insert into auth.users (id, email) values
  ('fa000000-0000-4000-8000-000000000001', 'k405host@example.invalid'),
  ('fa000000-0000-4000-8000-000000000002', 'k405member@example.invalid');

create temporary table k405_test (room_id uuid, pin text);
insert into k405_test
select public.k405_create_room('fa000000-0000-4000-8000-000000000001', pin), pin
from (
  select lpad(n::text, 6, '0') as pin from generate_series(0, 999999) n
  where not exists (select 1 from public.rooms r where r.pin = lpad(n::text, 6, '0') and r.status <> 'ended')
  limit 1
) available;
grant select on k405_test to authenticated;

do $$
declare r uuid := (select room_id from k405_test); p text := (select pin from k405_test); result jsonb;
begin
  if not exists (select 1 from public.room_members where room_id = r and user_id = 'fa000000-0000-4000-8000-000000000001') then
    raise exception 'host membership missing';
  end if;
  result := public.k405_join_room('fa000000-0000-4000-8000-000000000002', null, p);
  if result->>'roomId' <> r::text then raise exception 'join failed: %', result; end if;
  result := public.k405_join_room('fa000000-0000-4000-8000-000000000002', r, null);
  if result->>'roomId' <> r::text then raise exception 'retry failed: %', result; end if;
  update public.room_members set kicked_at = now() where room_id = r and user_id = 'fa000000-0000-4000-8000-000000000002';
  result := public.k405_join_room('fa000000-0000-4000-8000-000000000002', r, null);
  if result->>'code' <> 'FORBIDDEN' then raise exception 'kick ignored: %', result; end if;
  update public.rooms set status = 'locked' where id = r;
  result := public.k405_join_room('fa000000-0000-4000-8000-000000000002', r, null);
  if result->>'code' <> 'CONFLICT' then raise exception 'lock ignored: %', result; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'fa000000-0000-4000-8000-000000000002', true);
do $$
declare r uuid := (select room_id from k405_test); n integer;
begin
  delete from public.room_members where room_id = r and user_id = 'fa000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'authenticated user deleted membership'; end if;
  begin
    insert into public.room_members (room_id, user_id) values (r, 'fa000000-0000-4000-8000-000000000002');
    raise exception 'authenticated user inserted membership';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('authenticated', 'public.k405_join_room(uuid,uuid,text)', 'execute') then
    raise exception 'authenticated user can invoke privileged RPC';
  end if;
end $$;
reset role;
