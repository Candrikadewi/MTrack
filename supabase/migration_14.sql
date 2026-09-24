-- migration_14: Vokasi Reguler — Shop value mappings + shop column
--
-- The monthly raw Vokasi file (Voc_<Bulan>_System.csv) has typos in SHOP
-- (e.g. "ASSEMMBLY", "QUALITY INSP"). They're never auto-corrected: Upload
-- Center asks "ASSEMMBLY → ASSEMBLY?" once, and the confirmed mapping is
-- stored here so the same typo isn't asked about again next month
-- (docs/data-schema-vokasi-reguler.md). mapped_value = '' means "not a
-- valid shop, skip these rows".

create table if not exists value_mappings (
  id uuid primary key default gen_random_uuid(),
  dataset text not null check (dataset in ('zpar', 'vokasi')),
  field text not null,
  raw_value text not null,
  normalized_raw text not null,
  mapped_value text not null,
  decided_at timestamptz not null default now(),
  unique (dataset, field, normalized_raw)
);

alter table value_mappings enable row level security;

drop policy if exists "value_mappings: read all authenticated" on value_mappings;
create policy "value_mappings: read all authenticated" on value_mappings
  for select using (auth.uid() is not null);
drop policy if exists "value_mappings: admin writes" on value_mappings;
create policy "value_mappings: admin writes" on value_mappings
  for insert with check (my_role() = 'admin');
drop policy if exists "value_mappings: admin updates" on value_mappings;
create policy "value_mappings: admin updates" on value_mappings
  for update using (my_role() = 'admin') with check (my_role() = 'admin');
drop policy if exists "value_mappings: admin deletes" on value_mappings;
create policy "value_mappings: admin deletes" on value_mappings
  for delete using (my_role() = 'admin');

-- Shop is part of the Vokasi Reguler target schema (Div/Dept derive from it).
alter table vokasi_records add column if not exists shop text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'value_mappings'
  ) then
    alter publication supabase_realtime add table value_mappings;
  end if;
exception when undefined_object then
  null;
end $$;
