-- migration_13: column decisions for uploads + extra Vokasi values
--
-- ZPAR/Vokasi exports drift month to month (see docs/data-schema.md). Any
-- column outside the known schema is shown in Upload Center's Cek Data with
-- a "Pakai / Abaikan" decision. The decision is stored here once per dataset
-- + column, so the same column isn't asked about again next month.
--
-- Values of columns marked "use" are kept with each record: ZPAR employees
-- already live in jsonb (zpar_snapshots.employees[].extra), Vokasi needs a
-- jsonb column of its own.

create table if not exists column_decisions (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('zpar', 'vokasi')),
  column_name text not null,
  normalized text not null,
  decision text not null check (decision in ('use', 'ignore')),
  decided_at timestamptz not null default now(),
  unique (dataset, normalized)
);

alter table column_decisions enable row level security;

drop policy if exists "column_decisions: read all authenticated" on column_decisions;
create policy "column_decisions: read all authenticated" on column_decisions
  for select using (auth.uid() is not null);
drop policy if exists "column_decisions: admin writes" on column_decisions;
create policy "column_decisions: admin writes" on column_decisions
  for insert with check (my_role() = 'admin');
drop policy if exists "column_decisions: admin updates" on column_decisions;
create policy "column_decisions: admin updates" on column_decisions
  for update using (my_role() = 'admin') with check (my_role() = 'admin');
drop policy if exists "column_decisions: admin deletes" on column_decisions;
create policy "column_decisions: admin deletes" on column_decisions
  for delete using (my_role() = 'admin');

alter table vokasi_records add column if not exists extra jsonb not null default '{}'::jsonb;

-- Realtime, like the other tables the app subscribes to.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'column_decisions'
  ) then
    alter publication supabase_realtime add table column_decisions;
  end if;
exception when undefined_object then
  null;
end $$;
