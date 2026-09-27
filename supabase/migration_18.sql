-- migration_18: pekerjaan terjadwal di server bertindak sebagai admin
--
-- The daily server job (app/api/jobs/daily) connects with Supabase's
-- service role. Row level security already lets that role through, but
-- the RPCs check my_role(), which looks the caller up in profiles — and
-- the service role isn't a person with a profile, so they refused it.
--
-- my_role() now answers 'admin' for the service role. The role comes
-- from the verified JWT (request.jwt.claims, set by Supabase), so a
-- signed-in user can't claim it. The service role key must stay a
-- server-only secret — it is never sent to a browser.
--
-- Run after migration_17. Safe to run more than once.

create or replace function my_role()
returns text
language sql stable security definer
set search_path = public
as $$
  select case
    when coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role' then 'admin'
    else (select role from profiles where id = auth.uid())
  end;
$$;

insert into app_migrations (name) values ('migration_18') on conflict (name) do nothing;
