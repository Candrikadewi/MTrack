-- M-TRACK migration 9 — allow "Kaizen" as a util_pool source
-- Run this once in Supabase SQL Editor, AFTER schema.sql through
-- migration_8.sql have already been applied. Safe to re-run.

-- schema.sql's util_pool_source_check only allowed ProjectFinish/TaktDown —
-- Supply Pool now has a "+ Tambah Kaizen" action (see createKaizenSupply in
-- lib/engine/actions.ts) for manually recording MP released via a yearly
-- Kaizen/improvement challenge, so the source column needs a third value.
alter table util_pool drop constraint if exists util_pool_source_check;
alter table util_pool add constraint util_pool_source_check
  check (source in ('ProjectFinish', 'TaktDown', 'Kaizen'));
