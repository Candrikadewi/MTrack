import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_MIGRATIONS, missingMigrations } from "@/lib/migrations";
import { migrationFiles } from "../db/testDatabase";

describe("required migrations", () => {
  it("lists every migration from 15 on, and each one records itself", () => {
    const tracked = migrationFiles()
      .map((f) => f.replace(".sql", ""))
      .filter((name) => Number(name.split("_")[1]) >= 15);
    expect([...REQUIRED_MIGRATIONS]).toEqual(tracked);
    for (const name of tracked) {
      const sql = readFileSync(join(process.cwd(), "supabase", `${name}.sql`), "utf8");
      expect(sql, `${name} should insert itself into app_migrations`).toContain(
        `insert into app_migrations (name) values ('${name}')`
      );
    }
  });

  it("names what is still to be run, in order", () => {
    expect(missingMigrations(null)).toEqual(["migration_15", "migration_16"]);
    expect(missingMigrations(["migration_15"])).toEqual(["migration_16"]);
    expect(missingMigrations(["migration_15", "migration_16"])).toEqual([]);
  });
});
