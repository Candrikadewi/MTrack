-- M-TRACK migration 11 — Pers Area plant segregation for Vokasi
-- Run this once in Supabase SQL Editor, AFTER schema.sql through
-- migration_10.sql have already been applied. Safe to re-run.

-- ZPAR's plant classification (Vehicle Plant / Unit KRW Plant / Unit STR
-- Plant, derived from the "Pers Area" column — see mapPersAreaToPlant in
-- lib/parseFile.ts) needed no migration: EmployeeRecord lives inside
-- zpar_snapshots.employees, which is jsonb, so the field's values just
-- changed shape at the application layer. Vokasi records are real columns,
-- so this one needs an actual column added.
alter table vokasi_records add column if not exists plant text not null default '';
