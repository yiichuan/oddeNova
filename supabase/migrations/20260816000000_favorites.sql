create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  code text not null check (length(btrim(code)) > 0),
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array'),
  input_mode text check (input_mode is null or input_mode in ('normal', 'choice')),
  revisions jsonb check (revisions is null or jsonb_typeof(revisions) = 'array'),
  suggestions jsonb check (suggestions is null or jsonb_typeof(suggestions) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists favorites_user_created_id_idx
  on public.favorites (user_id, created_at desc, id desc);

alter table public.favorites enable row level security;

grant select, insert, delete on public.favorites to authenticated;

create policy "favorites_select_own"
  on public.favorites for select
  to authenticated
  using (auth.uid() = user_id);

create policy "favorites_insert_own"
  on public.favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "favorites_delete_own"
  on public.favorites for delete
  to authenticated
  using (auth.uid() = user_id);
