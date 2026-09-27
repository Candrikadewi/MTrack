-- migration_19: catatan error (monitoring)
--
-- Errors people run into — a page that crashed, a save the database
-- refused, a failed server request or nightly job — are recorded here, so
-- they can be fixed without waiting for someone to report them. Admins
-- read them in CAMP → Log Error. Nothing is sent to an outside service.
--
-- Anyone signed in can add an entry (as themselves); only admins can read
-- or clear them. The nightly job removes entries older than 90 days.
--
-- Run after migration_18. Safe to run more than once.

create table if not exists app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  source text not null check (source in ('client', 'render', 'save', 'server', 'job')),
  message text not null check (length(message) <= 2000),
  stack text check (length(stack) <= 8000),
  url text check (length(url) <= 1000),
  context jsonb not null default '{}'
);

create index if not exists app_errors_created_at on app_errors (created_at desc);

alter table app_errors enable row level security;

drop policy if exists "app_errors: signed-in users add their own" on app_errors;
create policy "app_errors: signed-in users add their own"
  on app_errors for insert
  with check (auth.uid() is not null and user_id = auth.uid());

drop policy if exists "app_errors: admin reads" on app_errors;
create policy "app_errors: admin reads"
  on app_errors for select
  using (my_role() = 'admin');

drop policy if exists "app_errors: admin clears" on app_errors;
create policy "app_errors: admin clears"
  on app_errors for delete
  using (my_role() = 'admin');

insert into app_migrations (name) values ('migration_19') on conflict (name) do nothing;
