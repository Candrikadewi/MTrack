import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTestDatabase, migrationFiles } from "./testDatabase";

it("check_migrations.sql lists every migration, all applied on a fully migrated database", async () => {
  const db = await createTestDatabase();
  const sql = readFileSync(join(process.cwd(), "supabase", "check_migrations.sql"), "utf8");
  const result = await db.query<{ migration: string; applied: boolean }>(sql);
  const listed = result.rows.map((r) => r.migration.split(" ")[0]);
  const expected = migrationFiles()
    .slice(1)
    .map((f) => f.replace(".sql", ""));
  expect(listed).toEqual(expected);
  expect(result.rows.filter((r) => !r.applied)).toEqual([]);
}, 60000);
