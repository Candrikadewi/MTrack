-- migration_15: pencatatan migration + penyimpanan atomik
--
-- 1. app_migrations — every migration from here on records itself, so the
--    app can tell an admin exactly which file still has to be run (instead
--    of an upload failing with "could not find the 'plant' column").
--
-- 2. apply_changes(ops) — saves several changes as ONE transaction: all of
--    them land, or none do. Used for actions that touch more than one row
--    (registering a project writes the project and all its demands; editing
--    or deleting one updates/removes many). Before this, a failure halfway
--    left a project without its demands.
--
--    It runs as the calling user (SECURITY INVOKER), so the normal row
--    level security applies to every change: it can't do anything the user
--    couldn't already do with direct writes.
--
-- Safe to run more than once.

create table if not exists app_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);

alter table app_migrations enable row level security;

drop policy if exists "app_migrations: read all authenticated" on app_migrations;
create policy "app_migrations: read all authenticated"
  on app_migrations for select
  using (auth.uid() is not null);

-- ops: [{ "op": "insert" | "upsert", "table": t, "row": {...} },
--       { "op": "update", "table": t, "id": uuid, "patch": {...} },
--       { "op": "delete", "table": t, "id": uuid }]
-- applied in order.
create or replace function apply_changes(ops jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  allowed constant text[] := array[
    'zpar_snapshots', 'vokasi_records', 'pkwt_reviews', 'demands', 'projects',
    'takt_cases', 'util_pool', 'handover_forms', 'column_decisions', 'value_mappings'
  ];
  op jsonb;
  tbl text;
  kind text;
  data jsonb;
  bad_cols text;
  cols text;
  sets text;
  affected int;
begin
  if jsonb_typeof(ops) <> 'array' then
    raise exception 'apply_changes: ops must be an array';
  end if;

  for op in select value from jsonb_array_elements(ops) loop
    tbl := op->>'table';
    kind := op->>'op';
    if not (tbl = any(allowed)) then
      raise exception 'apply_changes: unknown table %', tbl;
    end if;

    if kind = 'delete' then
      execute format('delete from %I where id = ($1)::uuid', tbl) using op->>'id';
      continue;
    end if;

    data := case when kind = 'update' then op->'patch' else op->'row' end;
    if jsonb_typeof(data) <> 'object' then
      raise exception 'apply_changes: % on % needs an object', kind, tbl;
    end if;

    -- A field the table doesn't have is an error, the same as a direct
    -- write — usually a migration that hasn't been run yet.
    select string_agg(k, ', ') into bad_cols
    from jsonb_object_keys(data) k
    where not exists (
      select 1 from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = tbl and c.column_name = k
    );
    if bad_cols is not null then
      raise exception 'apply_changes: % has no column %', tbl, bad_cols;
    end if;

    select string_agg(quote_ident(k), ', ') into cols from jsonb_object_keys(data) k;

    if kind in ('insert', 'upsert') then
      execute format(
        'insert into %1$I (%2$s) select %2$s from jsonb_populate_record(null::%1$I, $1)%3$s',
        tbl,
        cols,
        case
          when kind = 'upsert' then
            ' on conflict (id) do update set ('
            || cols || ') = row(' || (select string_agg('excluded.' || quote_ident(k), ', ') from jsonb_object_keys(data) k) || ')'
          else ''
        end
      ) using data;
    elsif kind = 'update' then
      if cols is null then
        continue;
      end if;
      execute format(
        'update %1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::%1$I, $1)) where id = ($2)::uuid',
        tbl,
        cols
      ) using data, op->>'id';
      get diagnostics affected = row_count;
      if affected = 0 then
        raise exception 'apply_changes: % % not found or not permitted', tbl, op->>'id';
      end if;
    else
      raise exception 'apply_changes: unknown op %', kind;
    end if;
  end loop;
end;
$$;

grant execute on function apply_changes(jsonb) to authenticated;

insert into app_migrations (name) values ('migration_15') on conflict (name) do nothing;
