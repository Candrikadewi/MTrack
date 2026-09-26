// Which database migrations this version of the app needs. From
// migration_15 on, each migration records itself in app_migrations (see
// supabase/migration_15.sql), so the app can tell an admin exactly which
// file still has to be run. Add a new migration's name here when adding
// the file; a test checks the two stay in step.
export const REQUIRED_MIGRATIONS = ["migration_15", "migration_16"] as const;

/** Required migrations not in `applied`, in the order to run them. `null`
 * means app_migrations itself doesn't exist yet — nothing from 15 on. */
export function missingMigrations(applied: string[] | null): string[] {
  const done = new Set(applied ?? []);
  return REQUIRED_MIGRATIONS.filter((name) => !done.has(name));
}
