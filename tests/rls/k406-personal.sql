begin;
-- MIGRATION_UNDER_TEST
insert into auth.users (id, email) values
 ('f7421000-0000-4000-8000-000000000001', 'k406-test-a@example.invalid'),
 ('f7421000-0000-4000-8000-000000000002', 'k406-test-b@example.invalid');
insert into public.rooms (id, host_id, pin, status) values
 ('f7422000-0000-4000-8000-000000000001', 'f7421000-0000-4000-8000-000000000001', '973001', 'ended');
insert into public.room_members (room_id, user_id, kicked_at) values
 ('f7422000-0000-4000-8000-000000000001', 'f7421000-0000-4000-8000-000000000001', null),
 ('f7422000-0000-4000-8000-000000000001', 'f7421000-0000-4000-8000-000000000002', now());
insert into public.sessions (id, room_id) values
 ('f7423000-0000-4000-8000-000000000001', 'f7422000-0000-4000-8000-000000000001');
do $$
declare
  v_strip uuid;
  v_first text;
  v_again text;
begin
  if has_function_privilege('authenticated', 'public.k406_create_personal_strip(uuid,uuid,jsonb)', 'execute')
     or has_function_privilege('anon', 'public.k406_share_strip(uuid,uuid,text)', 'execute')
     or not has_function_privilege('service_role', 'public.k406_share_strip(uuid,uuid,text)', 'execute') then
    raise exception 'Incorrect function privileges';
  end if;
  v_strip := public.k406_create_personal_strip('f7421000-0000-4000-8000-000000000001', 'f7423000-0000-4000-8000-000000000001', '{"version":1}');
  if not exists (select 1 from public.strip_owners where strip_id = v_strip and user_id = 'f7421000-0000-4000-8000-000000000001') then
    raise exception 'Personal owner missing';
  end if;
  v_first := public.k406_share_strip('f7421000-0000-4000-8000-000000000001', v_strip, repeat('a', 64));
  v_again := public.k406_share_strip('f7421000-0000-4000-8000-000000000001', v_strip, repeat('b', 64));
  if v_first <> repeat('a', 64) or v_again <> v_first then raise exception 'Share token is not stable'; end if;
  begin
    perform public.k406_create_personal_strip('f7421000-0000-4000-8000-000000000002', 'f7423000-0000-4000-8000-000000000001', '{"version":1}');
    raise exception 'Kicked user allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.k406_share_strip('f7421000-0000-4000-8000-000000000002', v_strip, repeat('c', 64));
    raise exception 'Non-owner allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
