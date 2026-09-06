-- Bring databases that already applied the original account-sessions migration
-- to the UUID-only shape. The launch has no supported legacy cloud data, so
-- the obsolete columns are intentionally dropped instead of backfilled.
alter table public.sessions
  add column if not exists input_mode text;

alter table public.sessions
  drop constraint if exists sessions_input_mode_check,
  drop constraint if exists sessions_user_id_session_id_key;

alter table public.sessions
  add constraint sessions_input_mode_check
  check (input_mode is null or input_mode in ('normal', 'choice'));

alter table public.sessions
  drop column if exists session_id,
  drop column if exists token_stats;

-- The client sends the durable updatedAt value. In particular, an idempotent
-- UUID upsert must not replace that value with the server clock on conflict.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.updated_at is null then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();
