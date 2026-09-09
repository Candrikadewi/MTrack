-- M-TRACK migration 8 — track prev_div on util_pool (Supply Pool)
-- Run this once in Supabase SQL Editor, AFTER schema.sql through
-- migration_7.sql have already been applied. Safe to re-run.

-- schema.sql only tracked prev_dept on util_pool entries — the Supply Pool
-- page's History tab now needs a Division filter alongside Department, so
-- the division a released person came from needs to be captured too (see
-- pushToUtilPool in lib/engine/actions.ts).
alter table util_pool add column if not exists prev_div text not null default '';
