-- M-TRACK migration 3 — Dashboard revision (Labor Type breakdown)
-- Run this once in Supabase SQL Editor, AFTER schema.sql and migration_2.sql
-- have already been applied. Safe to re-run.

alter table vokasi_records add column if not exists labor_type text not null default '';

alter table pkwt_reviews add column if not exists labor_type text not null default '';
