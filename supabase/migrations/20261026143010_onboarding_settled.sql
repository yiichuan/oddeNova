create table if not exists public.user_onboarding (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settled_at timestamptz not null default now()
);

alter table public.user_onboarding enable row level security;

grant select, insert on public.user_onboarding to authenticated;

create policy "user_onboarding_select_own"
  on public.user_onboarding for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_onboarding_insert_own"
  on public.user_onboarding for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
