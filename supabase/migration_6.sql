-- M-TRACK migration 6 — allow "Vokasi New Hire" as a Source on any demand
-- Run this once in Supabase SQL Editor, AFTER schema.sql through
-- migration_5.sql have already been applied. Safe to re-run.

-- migration_2.sql's demands_replacement_status_check only allowed PKWT New
-- Hire/MP Excess/MP Back Up/No Replace — a PKWT-origin demand can now also
-- be backfilled from the Vokasi pipeline (see effectiveDemandCategory in
-- lib/engine/enrollment.ts), so "Vokasi New Hire" needs to be a valid value
-- here too, not just on Vokasi-origin demands.
alter table demands drop constraint if exists demands_replacement_status_check;
alter table demands add constraint demands_replacement_status_check
  check (replacement_status in ('', 'PKWT New Hire', 'Vokasi New Hire', 'MP Excess', 'MP Back Up', 'No Replace'));
