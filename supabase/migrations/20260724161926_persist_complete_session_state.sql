alter table public.sessions
  add column if not exists revisions jsonb,
  add column if not exists suggestions jsonb,
  add column if not exists external_source jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_revisions_json_array'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_revisions_json_array
      check (revisions is null or jsonb_typeof(revisions) = 'array');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_suggestions_json_object'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_suggestions_json_object
      check (suggestions is null or jsonb_typeof(suggestions) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'sessions_external_source_json_object'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_external_source_json_object
      check (external_source is null or jsonb_typeof(external_source) = 'object');
  end if;
end
$$;
