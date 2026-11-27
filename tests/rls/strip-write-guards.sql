begin;
-- MIGRATION_UNDER_TEST
insert into auth.users (id, email) values
 ('bb721000-0000-4000-8000-000000000001', 'write-guard-a@example.invalid');
insert into public.rooms (id, host_id, pin, status) values
 ('bb722000-0000-4000-8000-000000000001', 'bb721000-0000-4000-8000-000000000001', '973002', 'ended');
insert into public.room_members (room_id, user_id) values
 ('bb722000-0000-4000-8000-000000000001', 'bb721000-0000-4000-8000-000000000001');
insert into public.sessions (id, room_id) values
 ('bb723000-0000-4000-8000-000000000001', 'bb722000-0000-4000-8000-000000000001');
insert into public.strips (id, session_id, kind, created_by) values
 ('bb724000-0000-4000-8000-000000000001', 'bb723000-0000-4000-8000-000000000001', 'personal', 'bb721000-0000-4000-8000-000000000001');
insert into public.strip_owners (strip_id, user_id) values
 ('bb724000-0000-4000-8000-000000000001', 'bb721000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'bb721000-0000-4000-8000-000000000001', true);
do $$
begin
  if has_column_privilege('authenticated', 'public.strip_owners', 'strip_id', 'update')
     or not has_column_privilege('authenticated', 'public.strip_owners', 'visibility', 'update') then
    raise exception 'Owner columns have incorrect privileges';
  end if;
  begin
    insert into public.strips (session_id, kind, created_by) values
      ('bb723000-0000-4000-8000-000000000001', 'shared', 'bb721000-0000-4000-8000-000000000001');
    raise exception 'Direct strip insert was accepted';
  exception when insufficient_privilege then null;
  end;
  update public.strips set share_token = 'should-not-update' where id = 'bb724000-0000-4000-8000-000000000001';
  if found then raise exception 'Direct strip update was accepted'; end if;
  update public.strip_owners set visibility = 'private' where strip_id = 'bb724000-0000-4000-8000-000000000001';
  if not found then raise exception 'Owner visibility update was blocked'; end if;
end $$;
reset role;
rollback;
