alter table public.favorites
  add column if not exists source_session_id uuid;

create unique index if not exists favorites_user_source_session_idx
  on public.favorites (user_id, source_session_id);

grant update on public.favorites to authenticated;

create policy "favorites_update_own"
  on public.favorites for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
