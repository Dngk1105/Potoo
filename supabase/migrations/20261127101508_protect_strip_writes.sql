-- Strip creation and edits must pass the server's authorization and provenance checks.
-- Owners retain their existing ability to update only their own visibility and hidden state.
drop policy if exists strips_insert on public.strips;
drop policy if exists strips_update on public.strips;
drop policy if exists strip_owners_insert on public.strip_owners;
revoke update on public.strip_owners from authenticated;
grant update (visibility, hidden_at) on public.strip_owners to authenticated;
