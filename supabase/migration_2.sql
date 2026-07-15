-- M-TRACK migration 2 — Enrollment Kontrak revision (PKWT replacement-status flow)
-- Run this once in Supabase SQL Editor, AFTER schema.sql has already been applied.
-- Safe to re-run.

alter table demands add column if not exists replacement_status text not null default ''
  check (replacement_status in ('', 'PKWT New Hire', 'MP Excess', 'MP Back Up', 'No Replace'));

alter table demands add column if not exists no_replace_reason text not null default '';

alter table demands add column if not exists replacement_employment_status text not null default ''
  check (replacement_employment_status in ('', 'Kontrak', 'Permanen', 'Vokasi'));

-- The origin_type check (if any) doesn't constrain values in this schema, so "Others" needs no migration there.

-- Replace set_demand_replacement with the expanded signature — drop the old
-- overload first since Postgres identifies functions by name + arg types.
drop function if exists set_demand_replacement(uuid, text, text, text, date, text, text);

create or replace function set_demand_replacement(
  p_demand_id uuid,
  p_replacement_status text,
  p_noreg text,
  p_nama text,
  p_batch text,
  p_tgl_masuk date,
  p_dept text,
  p_fs_status text,
  p_employment_status text,
  p_no_replace_reason text
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

  if p_replacement_status = 'No Replace' then
    update demands
    set replacement_status = 'No Replace',
        no_replace_reason = p_no_replace_reason,
        replacement_noreg = '',
        replacement_nama = '',
        replacement_batch = '',
        replacement_tgl_masuk = null,
        replacement_dept = '',
        replacement_employment_status = '',
        fs_status = '',
        status = 'Open'
    where id = p_demand_id;
  else
    update demands
    set replacement_status = p_replacement_status,
        no_replace_reason = '',
        replacement_noreg = p_noreg,
        replacement_nama = p_nama,
        replacement_batch = p_batch,
        replacement_tgl_masuk = p_tgl_masuk,
        replacement_dept = p_dept,
        replacement_employment_status = p_employment_status,
        fs_status = p_fs_status,
        status = case when p_nama <> '' then 'Fulfilled' else 'Open' end
    where id = p_demand_id;
  end if;
end;
$$;

grant execute on function set_demand_replacement to authenticated;
