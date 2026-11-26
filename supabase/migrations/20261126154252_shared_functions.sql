-- K2-02: shared SQL helpers used by RLS policies and Route Handlers (docs/design/permissions.md).
-- security definer so policies can call them without recursive RLS checks.

-- Create a profile row when a user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
begin
  base := lower(regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user'),
    '[^a-z0-9_]', '', 'g'));
  if char_length(base) < 3 then
    base := 'user';
  end if;
  base := left(base, 23) || '_' || left(replace(new.id::text, '-', ''), 8);
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    base,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_room_host(p_room_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.rooms r where r.id = p_room_id and r.host_id = p_user_id);
$$;

-- Active member: has a row and was not kicked. The host also has a member row.
create function public.is_room_member(p_room_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.user_id = p_user_id and m.kicked_at is null
  );
$$;

create function public.is_session_member(p_session_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    join public.room_members m on m.room_id = s.room_id
    where s.id = p_session_id and m.user_id = p_user_id and m.kicked_at is null
  );
$$;

create function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.addressee_id) = least(p_a, p_b)
      and greatest(f.requester_id, f.addressee_id) = greatest(p_a, p_b)
  );
$$;

create function public.is_strip_owner(p_strip_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.strip_owners o where o.strip_id = p_strip_id and o.user_id = p_user_id
  );
$$;

-- Viewer sees a strip only when EVERY owner allows it. Levels include the ones above:
-- private < session < friends < link. RLS treats 'link' like 'friends'; link access goes
-- through a Route Handler that checks strips.share_token.
create function public.can_view_strip(p_strip_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null
    and exists (select 1 from public.strip_owners o where o.strip_id = p_strip_id)
    and (
      public.is_strip_owner(p_strip_id, p_user_id)
      or not exists (
        select 1
        from public.strip_owners o
        join public.strips s on s.id = o.strip_id
        where o.strip_id = p_strip_id
          and not (
            (o.visibility in ('session', 'friends', 'link')
              and public.is_session_member(s.session_id, p_user_id))
            or (o.visibility in ('friends', 'link')
              and public.are_friends(o.user_id, p_user_id))
          )
      )
    );
$$;

-- Asset is usable when public, owned by the user, or the frame of a room/session the user is in.
create function public.can_use_asset(p_asset_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.assets a
    where a.id = p_asset_id
      and (
        a.visibility = 'public'
        or a.owner_id = p_user_id
        or exists (
          select 1 from public.rooms r
          where r.frame_id = a.id and public.is_room_member(r.id, p_user_id)
        )
        or exists (
          select 1 from public.sessions s
          where s.frame_id = a.id and public.is_session_member(s.id, p_user_id)
        )
      )
  );
$$;

-- Parse a uuid from a Storage path segment without throwing.
create function public.try_uuid(p text)
returns uuid
language sql immutable set search_path = ''
as $$
  select case
    when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid
  end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
