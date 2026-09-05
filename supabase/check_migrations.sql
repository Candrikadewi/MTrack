-- M-TRACK migration status check — run this in Supabase SQL Editor.
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
  );
