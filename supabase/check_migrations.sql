-- CAMP migration status check — run this in Supabase SQL Editor.
-- Read-only, safe to run anytime. Shows applied = true/false for each
-- migration by checking a distinctive column/constraint/function it adds.

select
  'migration_2 (replacement_status flow)' as migration,
  exists (select 1 from information_schema.columns where table_name = 'demands' and column_name = 'no_replace_reason') as applied
union all
select
  'migration_3 (labor_type breakdown)',
  exists (select 1 from information_schema.columns where table_name = 'vokasi_records' and column_name = 'labor_type')
union all
select
  'migration_4 (fulfillment confirmation)',
  exists (select 1 from information_schema.columns where table_name = 'demands' and column_name = 'fulfillment_confirmed_date')
union all
select
  'migration_5 (shop confirmation)',
  exists (select 1 from information_schema.columns where table_name = 'demands' and column_name = 'shop_confirmed_date')
union all
select
  'migration_6 (Vokasi New Hire source)',
  exists (
    select 1 from pg_constraint
    where conrelid = 'demands'::regclass
      and conname = 'demands_replacement_status_check'
      and pg_get_constraintdef(oid) like '%Vokasi New Hire%'
  )
union all
select
  'migration_7 (guest role)',
  exists (
    select 1 from pg_constraint
    where conrelid = 'profiles'::regclass
      and conname = 'profiles_role_check'
      and pg_get_constraintdef(oid) like '%guest%'
  )
union all
select
  'migration_8 (util_pool.prev_div)',
  exists (select 1 from information_schema.columns where table_name = 'util_pool' and column_name = 'prev_div')
union all
select
  'migration_9 (Kaizen source)',
  exists (
    select 1 from pg_constraint
    where conrelid = 'util_pool'::regclass
      and conname = 'util_pool_source_check'
      and pg_get_constraintdef(oid) like '%Kaizen%'
  )
union all
select
  'migration_10 (Takt Down plan_rows)',
  exists (select 1 from information_schema.columns where table_name = 'takt_cases' and column_name = 'plan_rows')
union all
select
  'migration_11 (Vokasi plant segregation)',
  exists (select 1 from information_schema.columns where table_name = 'vokasi_records' and column_name = 'plant')
union all
select
  'migration_12 (two-step pool mapping)',
  exists (select 1 from pg_proc where proname = 'propose_pool_candidate')
union all
select
  'migration_13 (column decisions + vokasi extra)',
  exists (select 1 from information_schema.tables where table_name = 'column_decisions')
  and exists (select 1 from information_schema.columns where table_name = 'vokasi_records' and column_name = 'extra')
union all
select
  'migration_14 (vokasi shop mappings)',
  exists (select 1 from information_schema.tables where table_name = 'value_mappings')
  and exists (select 1 from information_schema.columns where table_name = 'vokasi_records' and column_name = 'shop')
union all
select
  'migration_15 (atomic saves + migration log)',
  exists (select 1 from pg_proc where proname = 'apply_changes')
union all
select
  'migration_16 (no duplicate rows)',
  exists (select 1 from pg_indexes where indexname = 'pkwt_reviews_one_per_review_date')
union all
select
  'migration_17 (snapshot employee_count)',
  exists (select 1 from information_schema.columns where table_name = 'zpar_snapshots' and column_name = 'employee_count')
union all
select
  'migration_18 (server jobs act as admin)',
  exists (select 1 from app_migrations where name = 'migration_18')
union all
select
  'migration_19 (error log)',
  exists (select 1 from information_schema.tables where table_name = 'app_errors')
union all
select
  'migration_20 (working sets for large tables)',
  exists (select 1 from pg_proc where proname = 'demands_working_set');
