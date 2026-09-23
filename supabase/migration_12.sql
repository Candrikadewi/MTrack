-- migration_12: two-step pool mapping (Diusulkan → Verifikasi)
--
-- Before: picking an MP Excess/Back Up person from the Util Pool marked the
-- demand Fulfilled immediately, via direct table writes that RLS only
-- allows for admin — so a shop user's pick looked saved locally but was
-- silently rejected by the database.
--
-- After:
--   * propose_pool_candidate — admin (any category) or shop (PKWT only)
--     proposes a pool person. The demand stays Open; the pool entry is
--     reserved (status 'Assigned') so no other demand can take it.
--     Passing a null pool entry clears the proposal and releases the entry.
--   * confirm_demand_fulfillment — the verification step (Tgl Sign
--     Kontrak / Tgl Assigned) now belongs to admin and HR, per the
--     "shop recommends, HR verifies" rule. Shop no longer confirms.

create or replace function propose_pool_candidate(
  p_demand_id uuid,
  p_pool_entry_id uuid,
  p_fs_status text
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_role text := my_role();
  v_demand demands%rowtype;
  v_entry util_pool%rowtype;
begin
  select * into v_demand from demands where id = p_demand_id;
  if not found then
    raise exception 'Demand not found';
  end if;

  if v_role = 'admin' then
    -- allowed for any category
  elsif v_role = 'shop' and v_demand.category = 'PKWT' then
    -- allowed: Shop's edit scope is PKWT (Kontrak) demand candidates only
  else
    raise exception 'Not permitted: role % cannot propose a candidate for % demand', v_role, v_demand.category;
  end if;

  if v_demand.fulfillment_confirmed_date is not null then
    raise exception 'Demand sudah diverifikasi — batalkan verifikasi dulu sebelum mengganti kandidat';
  end if;

  if p_pool_entry_id is not null then
    select * into v_entry from util_pool where id = p_pool_entry_id;
    if not found then
      raise exception 'Supply Pool entry not found';
    end if;
    if v_entry.status <> 'Open' and v_entry.noreg <> v_demand.replacement_noreg then
      raise exception '% sudah diusulkan untuk demand lain', v_entry.nama;
    end if;
  end if;

  -- Release whichever entry was reserved for this demand before, unless
  -- it's the same person being re-proposed.
  if v_demand.replacement_noreg <> ''
     and (p_pool_entry_id is null or v_entry.noreg <> v_demand.replacement_noreg) then
    update util_pool
    set status = 'Open', action_note = ''
    where noreg = v_demand.replacement_noreg and status = 'Assigned';
  end if;

  if p_pool_entry_id is null then
    update demands
    set replacement_noreg = '',
        replacement_nama = '',
        replacement_dept = '',
        replacement_batch = '',
        fs_status = '',
        status = 'Open'
    where id = p_demand_id;
    return;
  end if;

  update demands
  set replacement_status = case
        when replacement_status in ('', 'No Replace') then 'MP Excess'
        else replacement_status
      end,
      no_replace_reason = '',
      replacement_noreg = v_entry.noreg,
      replacement_nama = v_entry.nama,
      replacement_dept = v_entry.prev_dept,
      replacement_batch = '',
      fs_status = p_fs_status,
      status = 'Open'
  where id = p_demand_id;

  update util_pool
  set status = 'Assigned',
      action_note = 'Diusulkan untuk demand ' || p_demand_id::text
  where id = p_pool_entry_id;
end;
$$;

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

  if v_role not in ('admin', 'hr') then
    raise exception 'Not permitted: role % cannot verify fulfillment (admin/HR only)', v_role;
  end if;

  update demands
  set fulfillment_confirmed_date = p_confirmed_date,
      status = case when p_confirmed_date is not null then 'Fulfilled' else 'Open' end
  where id = p_demand_id;
end;
$$;
