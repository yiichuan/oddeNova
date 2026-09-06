alter table public.sessions
  add column if not exists favorited_at timestamptz;

-- Favorites are kept on the session row from this migration onward. The
-- feature was not released with durable cloud favorites, so no old snapshot
-- rows are copied into sessions.

create index if not exists sessions_user_history_idx
  on public.sessions (user_id, updated_at desc, id desc)
  where favorited_at is null;

create index if not exists sessions_user_favorites_idx
  on public.sessions (user_id, favorited_at desc, id desc)
  where favorited_at is not null;

drop table if exists public.favorites;
