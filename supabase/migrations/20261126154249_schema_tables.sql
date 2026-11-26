-- K2-01: 11 tables per docs/design/database.md section 1.
-- Rules: uuid ids, created_at everywhere, text + check instead of enums, explicit on delete.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,32}$'),
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- One row per pair regardless of who sent the request.
create unique index friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  -- null owner = built-in system asset loaded by seed
  owner_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('frame', 'sticker', 'filter', 'accessory')),
  name text not null,
  storage_path text not null,
  manifest jsonb not null default '{"version": 1}'::jsonb check (manifest ? 'version'),
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index assets_owner_idx on public.assets (owner_id);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.profiles (id) on delete set null,
  pin text not null check (pin ~ '^[0-9]{4,8}$'),
  status text not null default 'open' check (status in ('open', 'locked', 'editing', 'ended')),
  frame_id uuid references public.assets (id) on delete set null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
-- PIN is unique among rooms that have not ended.
create unique index rooms_active_pin_key on public.rooms (pin) where status <> 'ended';
create index rooms_host_idx on public.rooms (host_id);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot_index int check (slot_index >= 0),
  kicked_at timestamptz,
  -- join time; used to pick the next host
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index room_members_user_idx on public.room_members (user_id);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  frame_id uuid references public.assets (id) on delete set null,
  started_at timestamptz,
  created_at timestamptz not null default now()
);
create index sessions_room_idx on public.sessions (room_id);

create table public.shots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  round int not null check (round >= 0),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (session_id, round, user_id)
);

create table public.strips (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  kind text not null check (kind in ('shared', 'personal')),
  created_by uuid references public.profiles (id) on delete set null,
  canvas_json jsonb not null default '{"version": 1}'::jsonb check (canvas_json ? 'version'),
  export_path text,
  share_token text unique,
  created_at timestamptz not null default now()
);
create index strips_session_idx on public.strips (session_id);

create table public.strip_owners (
  strip_id uuid not null references public.strips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  visibility text not null default 'session'
    check (visibility in ('private', 'session', 'friends', 'link')),
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (strip_id, user_id)
);
create index strip_owners_user_idx on public.strip_owners (user_id);

create table public.reactions (
  strip_id uuid not null references public.strips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('heart')),
  created_at timestamptz not null default now(),
  primary key (strip_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  strip_id uuid not null references public.strips (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_strip_idx on public.comments (strip_id);
