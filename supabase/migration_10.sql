-- M-TRACK migration 10 — Takt Down planned composition (plan_rows)
-- Run this once in Supabase SQL Editor, AFTER schema.sql through
-- migration_9.sql have already been applied. Safe to re-run.

-- Takt Down previously went straight to name-by-name selection in one shot,
-- with no way to edit afterward. A takt-time change commonly spans several
-- shops at once, each with its own Permanen/Vokasi/Kontrak and Team
-- Member/Leader composition — plan_rows records that per-shop/status/role
-- planned quantity before anyone maps actual names against it, and the
-- whole case (plan and names) stays editable after creation. See
-- createTaktDown/updateTaktDown in lib/engine/actions.ts.
alter table takt_cases add column if not exists plan_rows jsonb not null default '[]';
