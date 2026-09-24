-- M-TRACK migration 7 — add "guest" role (dashboard-only, read-only viewer)
-- Run this once in Supabase SQL Editor, AFTER schema.sql through
-- migration_6.sql have already been applied. Safe to re-run.

-- schema.sql's profiles_role_check only allowed admin/shop/hr — "guest" is a
-- new read-only role that can only reach the Dashboard page (enforced in
-- lib/roles.ts canAccessModule) and has no write path anywhere: every RPC
-- (set_demand_replacement, set_review_result, confirm_shop_receipt,
-- confirm_demand_fulfillment) only special-cases 'admin'/'shop'/'hr', so a
-- 'guest' caller falls through to their existing permission-denied default
-- with no RPC changes needed.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('admin', 'shop', 'hr', 'guest'));
