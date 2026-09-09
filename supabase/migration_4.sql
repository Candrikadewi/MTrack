-- M-TRACK migration 4 — Supply-Demand split & fulfillment confirmation
-- Run this once in Supabase SQL Editor, AFTER schema.sql, migration_2.sql and
-- migration_3.sql have already been applied. Safe to re-run.

alter table demands add column if not exists fulfillment_confirmed_date date;

-- set_demand_replacement no longer flips status to Fulfilled just because a
-- name was filled in — mapping a candidate and confirming fulfillment are now
-- two separate steps (see confirm_demand_fulfillment below). Signature is
-- unchanged from migration_2.sql's version, only the status-flip line is
-- removed (status is simply left as-is on this path).
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
        fulfillment_confirmed_date = null,
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
        fs_status = p_fs_status
    where id = p_demand_id;
  end if;
end;
$$;

grant execute on function set_demand_replacement to authenticated;

-- Confirms a mapped candidate has actually signed contract (new hire) or been
-- officially assigned to their destination department (MP Back Up/Excess) —
-- this, not just filling in a name, is what makes a Demand "Fulfilled".
-- Passing a null date un-confirms it (status reverts to Open).
create or replace function confirm_demand_fulfillment(
  p_demand_id uuid,
  p_confirmed_date date
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
    -- allowed
  else
    raise exception 'Not permitted: role % cannot confirm fulfillment for % demand', v_role, v_category;
  end if;

  update demands
  set fulfillment_confirmed_date = p_confirmed_date,
      status = case when p_confirmed_date is not null then 'Fulfilled' else 'Open' end
  where id = p_demand_id;
end;
$$;

grant execute on function confirm_demand_fulfillment to authenticated;
