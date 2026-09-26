// A real Postgres (PGlite, in memory) with the app's SQL applied in order,
// for testing migrations and database functions without touching Supabase.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const SUPABASE_DIR = join(process.cwd(), "supabase");

/** The bits of Supabase the SQL relies on: the auth schema, auth.uid(),
 * and the "authenticated" role. auth.uid() reads a setting so a test can
 * act as a given user (see actAs). */
const SUPABASE_STUB = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  end $$;
`;

/** schema.sql, then migration_2 … migration_N by number. */
export function migrationFiles(): string[] {
  const numbered = readdirSync(SUPABASE_DIR)
    .map((f) => ({ f, n: Number(/^migration_(\d+)\.sql$/.exec(f)?.[1]) }))
    .filter((x) => x.n)
    .sort((a, b) => a.n - b.n)
    .map((x) => x.f);
  return ["schema.sql", ...numbered];
}

export async function createTestDatabase(options: { upTo?: string } = {}): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(SUPABASE_DIR, file), "utf8"));
    } catch (err) {
      throw new Error(`${file} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (file === options.upTo) break;
  }
  // Supabase grants the API roles access to public tables; row level
  // security then decides row by row.
  await db.exec(`
    grant usage on schema public to authenticated;
    grant all on all tables in schema public to authenticated;
  `);
  return db;
}

/** Runs what follows as a signed-in user with this role — row level
 * security applies, as it does for the app. `asOwner` switches back. */
export async function actAs(db: PGlite, role: "admin" | "hr" | "shop" | "guest"): Promise<string> {
  await asOwner(db);
  const id = crypto.randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into profiles (id, email, role) values ($1, $2, $3)", [id, `${role}@test.local`, role]);
  await db.exec(`set test.uid = '${id}'; set role authenticated;`);
  return id;
}

/** Back to the database owner (no row level security), e.g. to check
 * what was really stored. */
export async function asOwner(db: PGlite): Promise<void> {
  await db.exec("reset role; reset test.uid;");
}
