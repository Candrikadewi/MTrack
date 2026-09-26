import { describe, expect, it } from "vitest";
import { createTestDatabase, migrationFiles } from "./testDatabase";

describe("database migrations", () => {
  it("apply cleanly, in order, to an empty database", async () => {
    const db = await createTestDatabase();
    const { rows } = await db.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' order by 1"
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      expect.arrayContaining([
        "demands",
        "pkwt_reviews",
        "projects",
        "takt_cases",
        "util_pool",
        "vokasi_records",
        "zpar_snapshots",
      ])
    );
    expect(migrationFiles()[0]).toBe("schema.sql");
  }, 60000);

  it("can be run a second time without breaking (the SQL Editor may re-run a file)", async () => {
    const db = await createTestDatabase();
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    for (const file of migrationFiles().slice(1)) {
      await expect(db.exec(readFileSync(join(process.cwd(), "supabase", file), "utf8")), file).resolves.toBeDefined();
    }
  }, 60000);
});
