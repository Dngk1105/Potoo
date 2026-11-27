-- Run against an isolated or transactional database with the migration applied.
begin;
-- MIGRATION_UNDER_TEST

insert into auth.users (id, email) values
  ('a93d1000-0000-4000-8000-000000000001', 'rls-owner-a@example.invalid'),
  ('a93d1000-0000-4000-8000-000000000002', 'rls-owner-b@example.invalid'),
  ('a93d1000-0000-4000-8000-000000000003', 'rls-friend@example.invalid'),
  ('a93d1000-0000-4000-8000-000000000004', 'rls-stranger@example.invalid'),
  ('a93d1000-0000-4000-8000-000000000005', 'rls-kicked@example.invalid');
insert into public.rooms (id, host_id, pin, status) values
  ('a93d2000-0000-4000-8000-000000000001', 'a93d1000-0000-4000-8000-000000000001', '9001', 'ended');
insert into public.room_members (room_id, user_id, kicked_at) values
  ('a93d2000-0000-4000-8000-000000000001', 'a93d1000-0000-4000-8000-000000000001', null),
  ('a93d2000-0000-4000-8000-000000000001', 'a93d1000-0000-4000-8000-000000000002', null),
  ('a93d2000-0000-4000-8000-000000000001', 'a93d1000-0000-4000-8000-000000000005', now());
insert into public.sessions (id, room_id) values
  ('a93d3000-0000-4000-8000-000000000001', 'a93d2000-0000-4000-8000-000000000001');
insert into public.strips (id, session_id, kind, created_by) values
  ('a93d4000-0000-4000-8000-000000000001', 'a93d3000-0000-4000-8000-000000000001', 'shared', 'a93d1000-0000-4000-8000-000000000001'),
  ('a93d4000-0000-4000-8000-000000000002', 'a93d3000-0000-4000-8000-000000000001', 'personal', 'a93d1000-0000-4000-8000-000000000001');
insert into public.strip_owners (strip_id, user_id, visibility) values
  ('a93d4000-0000-4000-8000-000000000001', 'a93d1000-0000-4000-8000-000000000001', 'session'),
  ('a93d4000-0000-4000-8000-000000000001', 'a93d1000-0000-4000-8000-000000000002', 'private');
insert into public.friendships (requester_id, addressee_id, status) values
  ('a93d1000-0000-4000-8000-000000000001', 'a93d1000-0000-4000-8000-000000000003', 'accepted'),
  ('a93d1000-0000-4000-8000-000000000002', 'a93d1000-0000-4000-8000-000000000003', 'accepted');
insert into storage.objects (bucket_id, name) values
  ('media', 'strips/a93d4000-0000-4000-8000-000000000001.png'),
  ('media', 'strips/a93d4000-0000-4000-8000-000000000002.png');

create function pg_temp.check_strip(p_user uuid, p_strip uuid, expected boolean, label text)
returns void language plpgsql as $$
declare actual boolean; row_visible boolean; object_visible boolean;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  actual := public.can_view_strip(p_strip);
  select exists (select 1 from public.strips where id = p_strip) into row_visible;
  select exists (select 1 from storage.objects where bucket_id = 'media'
    and name = 'strips/' || p_strip::text || '.png') into object_visible;
  if actual is distinct from expected or row_visible is distinct from expected
     or object_visible is distinct from expected then
    raise exception '%: expected %, helper %, strip %, storage %', label, expected, actual, row_visible, object_visible;
  end if;
end;
$$;

set local role authenticated;
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000001', 'a93d4000-0000-4000-8000-000000000001', false, 'creator blocked by other private owner');
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000002', 'a93d4000-0000-4000-8000-000000000001', true, 'private owner allowed by session owner');
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000003', 'a93d4000-0000-4000-8000-000000000001', false, 'friend blocked by private owner');
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000001', 'a93d4000-0000-4000-8000-000000000002', false, 'ownerless creator');
select pg_temp.check_strip(null, 'a93d4000-0000-4000-8000-000000000001', false, 'missing identity');
reset role;
update public.strip_owners set visibility = 'session' where user_id = 'a93d1000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000001', 'a93d4000-0000-4000-8000-000000000001', true, 'both owners allow member');
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000003', 'a93d4000-0000-4000-8000-000000000001', false, 'friend blocked by session');
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000005', 'a93d4000-0000-4000-8000-000000000001', false, 'kicked member');
reset role;
update public.strip_owners set visibility = case when user_id = 'a93d1000-0000-4000-8000-000000000001' then 'friends' else 'link' end;
set local role authenticated;
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000003', 'a93d4000-0000-4000-8000-000000000001', true, 'friend of both owners');
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000004', 'a93d4000-0000-4000-8000-000000000001', false, 'stranger and link RLS');
reset role;
delete from public.friendships where requester_id = 'a93d1000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.check_strip('a93d1000-0000-4000-8000-000000000003', 'a93d4000-0000-4000-8000-000000000001', false, 'friend of one owner only');
reset role;
rollback;
