-- Every owner must allow the viewer; link is treated as friends by RLS.
create or replace function public.can_view_strip(p_strip_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select p_user_id is not null
    and exists (select 1 from public.strip_owners o where o.strip_id = p_strip_id)
    and not exists (
      select 1
      from public.strip_owners o
      join public.strips s on s.id = o.strip_id
      where o.strip_id = p_strip_id
        and not (
          o.user_id = p_user_id
          or (o.visibility in ('session', 'friends', 'link')
            and public.is_session_member(s.session_id, p_user_id))
          or (o.visibility in ('friends', 'link')
            and public.are_friends(o.user_id, p_user_id))
        )
    );
$$;

alter policy strips_select on public.strips
  using (public.can_view_strip(id));
