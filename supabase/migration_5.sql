-- M-TRACK migration 5 — Shop Confirmation column (Supply-Demand)
-- Run this once in Supabase SQL Editor, AFTER schema.sql, migration_2.sql,
-- migration_3.sql and migration_4.sql have already been applied. Safe to re-run.

alter table demands add column if not exists shop_confirmed_date date;

-- No Replace should also clear any stray shop confirmation, same as it
-- already clears fulfillment_confirmed_date. Signature is unchanged from
-- migration_4.sql's version, only the No Replace branch gains one more
-- column reset.
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
        shop_confirmed_date = null,
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

-- Shop floor confirms the replacement candidate has actually reported for
-- duty — separate from confirm_demand_fulfillment (HR/admin contract-sign or
-- official-assignment step). Passing a null date un-confirms it. Does not
-- touch `status`/`fulfillment_confirmed_date` — the app derives the
-- shop-floor-facing status label (Open/DELAY/Need Replace ASAP/Fulfilled
-- Ontime/Fulfilled but Delay) client-side from shop_confirmed_date plus the
-- lead-time dates (see supplyDemandStatus in lib/engine/compute.ts).
create or replace function confirm_shop_receipt(
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
    -- allowed
  elsif v_role = 'shop' and v_category = 'PKWT' then
    -- allowed
  else
    raise exception 'Not permitted: role % cannot confirm shop receipt for % demand', v_role, v_category;
  end if;

  update demands
  set shop_confirmed_date = p_confirmed_date
  where id = p_demand_id;
end;
$$;

grant execute on function confirm_shop_receipt to authenticated;
