-- K2-03: RLS on every table (default deny) and Storage policies.
-- Policies only call the shared helpers from the previous migration.
-- Joining by PIN, host transfer and share links go through Route Handlers with the secret key.

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.assets enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.sessions enable row level security;
alter table public.shots enable row level security;
alter table public.strips enable row level security;
alter table public.strip_owners enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;

-- profiles: any signed-in user can look others up (friend search); edit only yourself.
create policy profiles_select on public.profiles
  for select to authenticated using (true);
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- friendships
create policy friendships_select on public.friendships
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));
create policy friendships_insert on public.friendships
  for insert to authenticated with check (requester_id = auth.uid() and status = 'pending');
create policy friendships_accept on public.friendships
  for update to authenticated using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());
create policy friendships_delete on public.friendships
  for delete to authenticated using (auth.uid() in (requester_id, addressee_id));

-- assets: soft delete only (deleted_at), so no delete policy.
create policy assets_select on public.assets
  for select to authenticated using (public.can_use_asset(id));
create policy assets_insert on public.assets
  for insert to authenticated with check (owner_id = auth.uid());
create policy assets_update on public.assets
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- rooms
create policy rooms_select on public.rooms
  for select to authenticated using (public.is_room_host(id) or public.is_room_member(id));
create policy rooms_insert on public.rooms
  for insert to authenticated with check (host_id = auth.uid());
create policy rooms_update on public.rooms
  for update to authenticated using (public.is_room_host(id));

-- room_members: join yourself into an open room (or your own room); host kicks/arranges; leave yourself.
create policy room_members_select on public.room_members
  for select to authenticated using (public.is_room_member(room_id) or public.is_room_host(room_id));
create policy room_members_insert on public.room_members
  for insert to authenticated with check (
    user_id = auth.uid()
    and (
      public.is_room_host(room_id)
      or exists (select 1 from public.rooms r where r.id = room_id and r.status = 'open')
    )
  );
create policy room_members_update on public.room_members
  for update to authenticated using (public.is_room_host(room_id));
create policy room_members_delete on public.room_members
  for delete to authenticated using (user_id = auth.uid());

-- sessions
create policy sessions_select on public.sessions
  for select to authenticated using (public.is_room_member(room_id));
create policy sessions_insert on public.sessions
  for insert to authenticated with check (public.is_room_host(room_id));
create policy sessions_update on public.sessions
  for update to authenticated using (public.is_room_host(room_id));

-- shots
create policy shots_select on public.shots
  for select to authenticated using (public.is_session_member(session_id));
create policy shots_insert on public.shots
  for insert to authenticated with check (user_id = auth.uid() and public.is_session_member(session_id));

-- strips
create policy strips_select on public.strips
  for select to authenticated using (
    public.can_view_strip(id) or (created_by = auth.uid() and public.is_session_member(session_id))
  );
create policy strips_insert on public.strips
  for insert to authenticated with check (created_by = auth.uid() and public.is_session_member(session_id));
create policy strips_update on public.strips
  for update to authenticated using (
    (kind = 'shared' and public.is_session_member(session_id))
    or (kind = 'personal' and created_by = auth.uid())
    or public.is_strip_owner(id)
  );

-- strip_owners: personal strip has only its creator; shared strip owners are added by a session member.
create policy strip_owners_select on public.strip_owners
  for select to authenticated using (public.can_view_strip(strip_id) or user_id = auth.uid());
create policy strip_owners_insert on public.strip_owners
  for insert to authenticated with check (
    exists (
      select 1 from public.strips s
      where s.id = strip_id
        and public.is_session_member(s.session_id)
        and public.is_session_member(s.session_id, user_id)
        and (s.kind = 'shared' or (s.created_by = auth.uid() and user_id = auth.uid()))
    )
  );
create policy strip_owners_update on public.strip_owners
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reactions
create policy reactions_select on public.reactions
  for select to authenticated using (public.can_view_strip(strip_id));
create policy reactions_insert on public.reactions
  for insert to authenticated with check (user_id = auth.uid() and public.can_view_strip(strip_id));
create policy reactions_update on public.reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reactions_delete on public.reactions
  for delete to authenticated using (user_id = auth.uid());

-- comments
create policy comments_select on public.comments
  for select to authenticated using (public.can_view_strip(strip_id));
create policy comments_insert on public.comments
  for insert to authenticated with check (user_id = auth.uid() and public.can_view_strip(strip_id));
create policy comments_delete on public.comments
  for delete to authenticated using (user_id = auth.uid() or public.is_strip_owner(strip_id));

-- Storage: one private bucket, read via signed URL. Paths per database.md section 4:
--   sessions/{sessionId}/{round}/{userId}.jpg
--   strips/{stripId}.png
--   assets/{ownerId}/{assetId}.png
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('media', 'media', false, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy media_select on storage.objects
  for select to authenticated using (
    bucket_id = 'media'
    and case (storage.foldername(name))[1]
      when 'sessions' then public.is_session_member(public.try_uuid((storage.foldername(name))[2]))
      when 'strips' then public.can_view_strip(public.try_uuid(split_part(storage.filename(name), '.', 1)))
      when 'assets' then
        public.try_uuid((storage.foldername(name))[2]) = auth.uid()
        or public.can_use_asset(public.try_uuid(split_part(storage.filename(name), '.', 1)))
      else false
    end
  );

create policy media_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'media'
    and case (storage.foldername(name))[1]
      when 'sessions' then
        split_part(storage.filename(name), '.', 1) = auth.uid()::text
        and public.is_session_member(public.try_uuid((storage.foldername(name))[2]))
      when 'strips' then exists (
        select 1 from public.strips s
        where s.id = public.try_uuid(split_part(storage.filename(name), '.', 1))
          and public.is_session_member(s.session_id)
      )
      when 'assets' then public.try_uuid((storage.foldername(name))[2]) = auth.uid()
      else false
    end
  );

-- Re-export of a strip overwrites strips/{stripId}.png (upsert needs update).
create policy media_update on storage.objects
  for update to authenticated using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'strips'
    and exists (
      select 1 from public.strips s
      where s.id = public.try_uuid(split_part(storage.filename(name), '.', 1))
        and public.is_session_member(s.session_id)
    )
  );
