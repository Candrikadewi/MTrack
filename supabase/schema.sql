-- M-TRACK Supabase schema — run this once in Supabase SQL Editor
-- (Project → SQL Editor → New query → paste this whole file → Run)
--
-- Design notes:
--   * Top-level entities map 1:1 to the app's localStorage stores.
--   * Small nested arrays (snapshot employees, project/takt rows, handover rows)
--     are stored as jsonb rather than normalized into their own tables — this
--     keeps the migration from the localStorage version mechanical and keeps
--     query patterns identical to the original data model (spec §3).
--   * Role enforcement for the two narrow non-admin write paths (Shop filling
--     a PKWT replacement, HR setting a review result) goes through dedicated
--     SECURITY DEFINER functions rather than column-level RLS, so the rule is
--     enforced in the database no matter what the client sends.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'shop', 'hr')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create or replace function my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

drop policy if exists "profiles: read own or admin reads all" on profiles;
create policy "profiles: read own or admin reads all"
  on profiles for select
  using (id = auth.uid() or my_role() = 'admin');

drop policy if exists "profiles: admin manages roles" on profiles;
create policy "profiles: admin manages roles"
  on profiles for all
  using (my_role() = 'admin')
  with check (my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- Core entities (mirrors lib/types.ts)
-- ---------------------------------------------------------------------------

create table if not exists zpar_snapshots (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  filename text not null,
  upload_date timestamptz not null default now(),
  is_active boolean not null default false,
  employees jsonb not null default '[]'
);

create table if not exists vokasi_records (
  id uuid primary key default gen_random_uuid(),
  noreg text not null,
  nama text not null,
  batch text not null,
  div text not null,
  dept text not null,
  lokasi text,
  tgl_masuk date,
  tgl_ended date,
  utilisasi text,
  status_saat_ini text,
  gender text,
  upload_date timestamptz not null default now()
);

create table if not exists pkwt_reviews (
  id uuid primary key default gen_random_uuid(),
  noreg text not null,
  nama text not null,
  status_kontrak text not null,
  div text not null,
  dept text not null,
  tgl_masuk date not null,
  tgl_review date not null,
  review_result text not null default '' check (review_result in ('', 'Continue', 'Terminate')),
  demand_id uuid
);

create table if not exists demands (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('Vokasi', 'PKWT')),
  origin_type text not null,
  origin_ref text not null default '',
  origin_label text,
  outgoing_noreg text not null default '',
  outgoing_nama text not null default '',
  outgoing_label text not null default '',
  div text not null default '',
  dept text not null default '',
  tgl_masuk_outgoing date,
  tgl_ended_outgoing date,
  fulfill_date date,
  replacement_noreg text not null default '',
  replacement_nama text not null default '',
  replacement_batch text not null default '',
  replacement_tgl_masuk date,
  replacement_dept text not null default '',
  fs_status text not null default '',
  status text not null default 'Open' check (status in ('Open', 'Fulfilled')),
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'Ongoing' check (status in ('Ongoing', 'Finish')),
  rows jsonb not null default '[]',
  demand_ids jsonb not null default '[]'
);

create table if not exists takt_cases (
  id uuid primary key default gen_random_uuid(),
  plant text not null check (plant in ('Plant 1', 'Plant 2')),
  date date not null,
  category text not null check (category in ('up', 'down')),
  takt_before numeric not null,
  takt_after numeric not null,
  need_rows jsonb not null default '[]',
  demand_ids jsonb not null default '[]',
  released_persons jsonb not null default '[]',
  released_pool_ids jsonb not null default '[]'
);

create table if not exists util_pool (
  id uuid primary key default gen_random_uuid(),
  noreg text not null,
  nama text not null,
  type text not null,
  source text not null check (source in ('ProjectFinish', 'TaktDown')),
  source_label text not null default '',
  prev_dept text not null default '',
  entered_pool_date date not null default current_date,
  contract_end date,
  status text not null default 'Open' check (status in ('Open', 'Assigned', 'Released')),
  action_note text not null default ''
);

create table if not exists handover_forms (
  id uuid primary key default gen_random_uuid(),
  dept text not null,
  period text not null,
  status text not null default 'Draft' check (status in ('Draft', 'Completed')),
  rows jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: everyone signed in can read; only admin can write directly.
-- Shop/HR get their two narrow write paths via RPC functions below.
-- ---------------------------------------------------------------------------

alter table zpar_snapshots enable row level security;
alter table vokasi_records enable row level security;
alter table pkwt_reviews enable row level security;
alter table demands enable row level security;
alter table projects enable row level security;
alter table takt_cases enable row level security;
alter table util_pool enable row level security;
alter table handover_forms enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['zpar_snapshots','vokasi_records','pkwt_reviews','demands','projects','takt_cases','util_pool','handover_forms']
  loop
    execute format('drop policy if exists "%1$s: read all authenticated" on %1$s', t);
    execute format('create policy "%1$s: read all authenticated" on %1$s for select using (auth.uid() is not null)', t);
    execute format('drop policy if exists "%1$s: admin writes" on %1$s', t);
    execute format('create policy "%1$s: admin writes" on %1$s for insert with check (my_role() = ''admin'')', t);
    execute format('drop policy if exists "%1$s: admin updates" on %1$s', t);
    execute format('create policy "%1$s: admin updates" on %1$s for update using (my_role() = ''admin'') with check (my_role() = ''admin'')', t);
    execute format('drop policy if exists "%1$s: admin deletes" on %1$s', t);
    execute format('create policy "%1$s: admin deletes" on %1$s for delete using (my_role() = ''admin'')', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Narrow write RPCs for Shop and HR
-- ---------------------------------------------------------------------------

-- Shop: fill Noreg Pengganti, but only on PKWT-category demands.
-- Admin may also call this (used by the single Enrollment UI for both roles).
create or replace function set_demand_replacement(
  p_demand_id uuid,
  p_noreg text,
  p_nama text,
  p_batch text,
  p_tgl_masuk date,
  p_dept text,
  p_fs_status text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text := my_role();
  v_category text;
begin
  select category into v_category from demands where id = p_demand_id;
  if v_category is null then
    raise exception 'Demand not found';
  end if;

  if v_role = 'admin' then
    -- allowed for any category
  elsif v_role = 'shop' and v_category = 'PKWT' then
    -- allowed: Shop's edit scope is PKWT (Kontrak) demand candidates only
  else
    raise exception 'Not permitted: role % cannot fill replacement for % demand', v_role, v_category;
  end if;

  update demands
  set replacement_noreg = p_noreg,
      replacement_nama = p_nama,
      replacement_batch = p_batch,
      replacement_tgl_masuk = p_tgl_masuk,
      replacement_dept = p_dept,
      fs_status = p_fs_status,
      status = case when p_nama <> '' then 'Fulfilled' else 'Open' end
  where id = p_demand_id;
end;
$$;

grant execute on function set_demand_replacement to authenticated;

-- HR: set review_result on a PKWT review, and (when Terminate) create the
-- resulting PKWT Demand — mirrors lib/engine/actions.ts#setReviewResult.
create or replace function set_review_result(
  p_review_id uuid,
  p_result text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text := my_role();
  v_review pkwt_reviews%rowtype;
  v_demand_id uuid;
begin
  if v_role not in ('admin', 'hr') then
    raise exception 'Not permitted: role % cannot set review result', v_role;
  end if;
  if p_result not in ('', 'Continue', 'Terminate') then
    raise exception 'Invalid review result: %', p_result;
  end if;

  select * into v_review from pkwt_reviews where id = p_review_id;
  if v_review.id is null then
    raise exception 'Review not found';
  end if;

  update pkwt_reviews set review_result = p_result where id = p_review_id;

  if p_result = 'Terminate' and v_review.demand_id is null then
    insert into demands (category, origin_type, origin_ref, outgoing_noreg, outgoing_nama, div, dept, tgl_masuk_outgoing, tgl_ended_outgoing, status)
    values ('PKWT', 'PkwtTerminate', v_review.id::text, v_review.noreg, v_review.nama, v_review.div, v_review.dept, v_review.tgl_masuk, v_review.tgl_review, 'Open')
    returning id into v_demand_id;

    update pkwt_reviews set demand_id = v_demand_id where id = p_review_id;
  end if;
end;
$$;

grant execute on function set_review_result to authenticated;
