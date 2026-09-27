-- migration_20: data aktif (working set) untuk tabel besar
--
-- Demand, review PKWT, Vokasi dan Supply Pool terus bertambah dan tidak
-- pernah dihapus. Sebelumnya browser memuat SEMUA baris tiap tabel; di
-- jutaan baris itu tidak mungkin lagi. Mulai sekarang browser hanya memuat
-- "data aktif": yang masih berjalan, yang terjadi 12 bulan terakhir, dan
-- yang masih dirujuk olehnya. Data yang lebih lama tetap ada di database —
-- dibaca server saat dibutuhkan (Arsip di History, bulan lama di
-- Dashboard, pengecekan dobel saat upload).
--
-- Every function runs as the calling user (SECURITY INVOKER): row level
-- security applies exactly as for a direct select. Each one returns the
-- table's own rows, so the app reads them the same way it reads the table
-- (select, order, range).
--
-- The rules, per table ("since" = the first day of the month 12 months
-- ago, see working_set_since):
--
--   demands      still open (not fulfilled, or not yet received by the
--                shop unless No Replace); any of its dates since; every
--                Project / Takt Up seat, and the whole chain of demands
--                that refilled each seat (Vokasi Ended / PKWT Terminate of
--                whoever held it, including a rehired alumnus' new noreg).
--   pkwt_reviews reviewed since, or still waiting for a result; plus the
--                review behind any active demand.
--   vokasi_records still running or ended since, or started since; plus
--                anyone an active demand is about (outgoing, replacement,
--                the record a Vokasi Ended demand came from).
--   util_pool    still Open, entered since, every project release, anyone
--                a Takt Down case lists, and anyone filling an active
--                demand.
--
-- Also: indexes for these rules and for reading older rows by person,
-- batch and date, and vokasi_batch_summary() for the Upload Center batch
-- list.
--
-- Run after migration_19. Safe to run more than once.

create or replace function working_set_since()
returns date
language sql
stable
as $$
  select (date_trunc('month', now()) - interval '12 months')::date
$$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists demands_open on demands (id) where status = 'Open';
create index if not exists demands_awaiting_shop on demands (id)
  where shop_confirmed_date is null and replacement_status <> 'No Replace';
create index if not exists demands_origin on demands (origin_type, origin_ref);
create index if not exists demands_outgoing_noreg on demands (outgoing_noreg);
create index if not exists demands_replacement_noreg on demands (replacement_noreg);
create index if not exists demands_created_at on demands (created_at);
create index if not exists demands_fulfill_date on demands (fulfill_date);
create index if not exists demands_tgl_ended_outgoing on demands (tgl_ended_outgoing);
create index if not exists demands_fulfillment_confirmed_date on demands (fulfillment_confirmed_date);
create index if not exists demands_shop_confirmed_date on demands (shop_confirmed_date);

create index if not exists pkwt_reviews_tgl_review on pkwt_reviews (tgl_review);
create index if not exists pkwt_reviews_pending on pkwt_reviews (id) where review_result = '';
create index if not exists pkwt_reviews_demand_id on pkwt_reviews (demand_id);
-- (noreg, tgl_review) is already indexed by migration_16.

create index if not exists vokasi_records_noreg on vokasi_records (noreg);
create index if not exists vokasi_records_batch on vokasi_records (batch);
create index if not exists vokasi_records_tgl_ended on vokasi_records (tgl_ended);
create index if not exists vokasi_records_tgl_masuk on vokasi_records (tgl_masuk);
create index if not exists vokasi_records_no_end on vokasi_records (id) where tgl_ended is null;

create index if not exists util_pool_open on util_pool (id) where status = 'Open';
create index if not exists util_pool_entered on util_pool (entered_pool_date);
create index if not exists util_pool_noreg on util_pool (noreg);
create index if not exists util_pool_source on util_pool (source, source_label);

-- ---------------------------------------------------------------------------
-- demands
-- ---------------------------------------------------------------------------

-- Each rule is its own select (joined by union), so each can use its own
-- index instead of one scan over the whole table.
create or replace function demands_working_set()
returns setof demands
language sql
stable
security invoker
set search_path = public
as $$
  with recursive seat_chain(id, noreg) as (
    select d.id, d.replacement_noreg
    from demands d
    where d.origin_type in ('Project', 'TaktUp')
    union
    select n.id, n.replacement_noreg
    from seat_chain c
    left join value_mappings m
      on m.dataset = 'vokasi' and m.field = 'noreg_zpar' and m.normalized_raw = upper(trim(c.noreg))
    join demands n
      on n.origin_type in ('PkwtTerminate', 'VokasiEnded')
     and (n.outgoing_noreg = c.noreg or n.outgoing_noreg = m.mapped_value)
    where c.noreg <> ''
  )
  select d.*
  from demands d
  where d.id in (
    select id from demands where status = 'Open'
    union select id from demands where shop_confirmed_date is null and replacement_status <> 'No Replace'
    union select id from demands where created_at >= working_set_since()
    union select id from demands where fulfill_date >= working_set_since()
    union select id from demands where tgl_ended_outgoing >= working_set_since()
    union select id from demands where fulfillment_confirmed_date >= working_set_since()
    union select id from demands where shop_confirmed_date >= working_set_since()
    union select id from seat_chain
  )
$$;

-- ---------------------------------------------------------------------------
-- pkwt_reviews
-- ---------------------------------------------------------------------------

create or replace function pkwt_reviews_working_set()
returns setof pkwt_reviews
language sql
stable
security invoker
set search_path = public
as $$
  with active_demands as materialized (
    select id, origin_type, origin_ref from demands_working_set()
  )
  select r.*
  from pkwt_reviews r
  where r.id in (
    select id from pkwt_reviews where tgl_review >= working_set_since()
    union select id from pkwt_reviews where review_result = ''
    union
    select r2.id
    from active_demands d
    join pkwt_reviews r2
      on r2.id = case when d.origin_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then d.origin_ref::uuid end
    where d.origin_type = 'PkwtTerminate'
    union
    select r2.id from active_demands d join pkwt_reviews r2 on r2.demand_id = d.id
  )
$$;

-- ---------------------------------------------------------------------------
-- vokasi_records
-- ---------------------------------------------------------------------------

create or replace function vokasi_records_working_set()
returns setof vokasi_records
language sql
stable
security invoker
set search_path = public
as $$
  with active_demands as materialized (
    select origin_type, origin_ref, outgoing_noreg, replacement_noreg from demands_working_set()
  )
  select v.*
  from vokasi_records v
  where v.id in (
    select id from vokasi_records where tgl_ended >= working_set_since()
    union select id from vokasi_records where tgl_ended is null
    union select id from vokasi_records where tgl_masuk >= working_set_since()
    union
    select v2.id from active_demands d join vokasi_records v2 on v2.noreg = d.outgoing_noreg where d.outgoing_noreg <> ''
    union
    select v2.id from active_demands d join vokasi_records v2 on v2.noreg = d.replacement_noreg where d.replacement_noreg <> ''
    union
    select v2.id
    from active_demands d
    join vokasi_records v2
      on v2.id = case when d.origin_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then d.origin_ref::uuid end
    where d.origin_type = 'VokasiEnded'
  )
$$;

-- ---------------------------------------------------------------------------
-- util_pool
-- ---------------------------------------------------------------------------

create or replace function util_pool_working_set()
returns setof util_pool
language sql
stable
security invoker
set search_path = public
as $$
  with filling as materialized (
    select distinct replacement_noreg as noreg from demands_working_set() where replacement_noreg <> ''
  )
  select u.*
  from util_pool u
  where u.id in (
    select id from util_pool where status = 'Open'
    union select id from util_pool where entered_pool_date >= working_set_since()
    union select id from util_pool where source = 'ProjectFinish'
    union
    select u2.id
    from takt_cases t
    cross join lateral jsonb_array_elements_text(t.released_pool_ids) as x(pool_id)
    join util_pool u2
      on u2.id = case when x.pool_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x.pool_id::uuid end
    union
    select u2.id from filling f join util_pool u2 on u2.noreg = f.noreg
  )
$$;

-- ---------------------------------------------------------------------------
-- Upload Center: every Vokasi batch, without reading every record
-- ---------------------------------------------------------------------------

create or replace function vokasi_batch_summary()
returns table (batch text, records bigint, upload_date timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select v.batch, count(*), max(v.upload_date)
  from vokasi_records v
  group by v.batch
  order by max(v.upload_date) desc, v.batch
$$;

grant execute on function working_set_since() to authenticated;
grant execute on function demands_working_set() to authenticated;
grant execute on function pkwt_reviews_working_set() to authenticated;
grant execute on function vokasi_records_working_set() to authenticated;
grant execute on function util_pool_working_set() to authenticated;
grant execute on function vokasi_batch_summary() to authenticated;

insert into app_migrations (name) values ('migration_20') on conflict (name) do nothing;
