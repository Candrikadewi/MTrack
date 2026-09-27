-- migration_17: jumlah karyawan per snapshot ZPAR, tanpa mengunduh daftarnya
--
-- The app now reads only the active snapshot's employee list up front,
-- and other months' lists only when a chart needs them (lib/snapshots.ts).
-- Upload Center still shows how many employees every snapshot has; this
-- column lets it read that number instead of the whole list.
--
-- Computed by the database from the stored list, so it's never out of
-- step. Until this is run the app reads every column, as before.
--
-- Run after migration_16. Safe to run more than once.

alter table zpar_snapshots
  add column if not exists employee_count integer
  generated always as (jsonb_array_length(employees)) stored;

insert into app_migrations (name) values ('migration_17') on conflict (name) do nothing;
