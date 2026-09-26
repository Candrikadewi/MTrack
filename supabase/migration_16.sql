-- migration_16: cegah data dobel
--
-- The app checks before creating these rows, but two admins (or two open
-- tabs) acting at the same moment could each create the same one. These
-- unique rules make the database refuse the second copy:
--
--   * one PKWT review per employee per review date     (noreg, tgl_review)
--   * one Vokasi Ended demand per Vokasi record        (origin_ref)
--   * one PKWT Terminate demand per review             (origin_ref)
--   * one Project-release Supply Pool entry per person per project
--                                                      (source_label, noreg)
--
-- Duplicates already in the table are cleaned up first, carefully:
--   * only copies nobody has worked on are removed — the row with progress
--     (a review result, a candidate, a confirmation, a pool assignment) is
--     the one kept;
--   * every removed row is copied into removed_duplicates first, so
--     nothing is lost;
--   * if two copies BOTH have progress, nothing is changed and the
--     migration stops with a message naming them, for an admin to sort
--     out by hand.
--
-- Run after migration_15. Safe to run more than once.

create table if not exists removed_duplicates (
  id bigserial primary key,
  table_name text not null,
  kept_id uuid not null,
  row_data jsonb not null,
  removed_at timestamptz not null default now()
);

alter table removed_duplicates enable row level security;

drop policy if exists "removed_duplicates: admin reads" on removed_duplicates;
create policy "removed_duplicates: admin reads"
  on removed_duplicates for select
  using (my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Stop if a duplicate can't be resolved safely
-- ---------------------------------------------------------------------------

do $$
declare
  problems text;
begin
  select string_agg(label, '; ') into problems from (
    select 'review PKWT ' || noreg || ' ' || tgl_review as label
    from pkwt_reviews
    group by noreg, tgl_review
    having count(*) filter (where review_result <> '' or demand_id is not null) > 1
    union all
    select origin_type || ' demand untuk ' || origin_ref
    from demands
    where origin_type in ('VokasiEnded', 'PkwtTerminate')
    group by origin_type, origin_ref
    having count(*) filter (
      where replacement_noreg <> ''
         or fulfillment_confirmed_date is not null
         or shop_confirmed_date is not null
         or status <> 'Open'
         or replacement_status not in ('', 'Vokasi New Hire')
    ) > 1
    union all
    select 'Supply Pool ' || noreg || ' dari project ' || source_label
    from util_pool
    where source = 'ProjectFinish'
    group by source_label, noreg
    having count(*) filter (where status <> 'Open') > 1
  ) conflicts;

  if problems is not null then
    raise exception 'migration_16 dihentikan, tidak ada yang diubah. Data dobel ini sama-sama sudah diproses, pilih salah satu secara manual lalu jalankan lagi: %', problems;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- PKWT reviews
-- ---------------------------------------------------------------------------

with ranked as (
  select
    r.id,
    first_value(r.id) over w as kept_id,
    row_number() over w as rn
  from pkwt_reviews r
  window w as (partition by r.noreg, r.tgl_review order by (r.review_result <> '') desc, (r.demand_id is not null) desc, r.id)
),
logged as (
  insert into removed_duplicates (table_name, kept_id, row_data)
  select 'pkwt_reviews', ranked.kept_id, to_jsonb(r)
  from ranked join pkwt_reviews r on r.id = ranked.id
  where ranked.rn > 1
  returning (row_data->>'id')::uuid as id
)
delete from pkwt_reviews where id in (select id from logged);

create unique index if not exists pkwt_reviews_one_per_review_date on pkwt_reviews (noreg, tgl_review);

-- ---------------------------------------------------------------------------
-- Vokasi Ended / PKWT Terminate demands
-- ---------------------------------------------------------------------------

with ranked as (
  select
    d.id,
    first_value(d.id) over w as kept_id,
    row_number() over w as rn
  from demands d
  where d.origin_type in ('VokasiEnded', 'PkwtTerminate')
  window w as (
    partition by d.origin_type, d.origin_ref
    order by
      (d.replacement_noreg <> ''
        or d.fulfillment_confirmed_date is not null
        or d.shop_confirmed_date is not null
        or d.status <> 'Open'
        or d.replacement_status not in ('', 'Vokasi New Hire')) desc,
      -- the demand a review points at is the one to keep
      exists (select 1 from pkwt_reviews r where r.demand_id = d.id) desc,
      d.created_at,
      d.id
  )
),
logged as (
  insert into removed_duplicates (table_name, kept_id, row_data)
  select 'demands', ranked.kept_id, to_jsonb(d)
  from ranked join demands d on d.id = ranked.id
  where ranked.rn > 1
  returning (row_data->>'id')::uuid as id
)
delete from demands where id in (select id from logged);

create unique index if not exists demands_one_vokasi_ended_per_record
  on demands (origin_ref) where origin_type = 'VokasiEnded';
create unique index if not exists demands_one_terminate_per_review
  on demands (origin_ref) where origin_type = 'PkwtTerminate';

-- ---------------------------------------------------------------------------
-- Supply Pool entries from a project release
-- ---------------------------------------------------------------------------

with ranked as (
  select
    u.id,
    first_value(u.id) over w as kept_id,
    row_number() over w as rn
  from util_pool u
  where u.source = 'ProjectFinish'
  window w as (partition by u.source_label, u.noreg order by (u.status <> 'Open') desc, u.entered_pool_date, u.id)
),
logged as (
  insert into removed_duplicates (table_name, kept_id, row_data)
  select 'util_pool', ranked.kept_id, to_jsonb(u)
  from ranked join util_pool u on u.id = ranked.id
  where ranked.rn > 1
  returning (row_data->>'id')::uuid as id
)
delete from util_pool where id in (select id from logged);

create unique index if not exists util_pool_one_project_release_per_person
  on util_pool (source_label, noreg) where source = 'ProjectFinish';

insert into app_migrations (name) values ('migration_16') on conflict (name) do nothing;

-- What was cleaned up (empty when there were no duplicates).
select table_name, count(*) as removed_duplicates
from removed_duplicates
group by table_name;
