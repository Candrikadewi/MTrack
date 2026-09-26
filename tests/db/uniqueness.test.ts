import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDatabase } from "./testDatabase";

const MIGRATION_16 = readFileSync(join(process.cwd(), "supabase", "migration_16.sql"), "utf8");

async function beforeMigration16(): Promise<PGlite> {
  return createTestDatabase({ upTo: "migration_15.sql" });
}

async function review(db: PGlite, id: string, result = "", noreg = "026001") {
  await db.query(
    `insert into pkwt_reviews (id, noreg, nama, status_kontrak, div, dept, tgl_masuk, tgl_review, review_result)
     values ($1, $2, 'Budi', 'Kontrak 1.1', 'Assy', 'Assy 1', '2024-10-01', '2026-09-30', $3)`,
    [id, noreg, result]
  );
}

async function vokasiDemand(db: PGlite, id: string, replacementNoreg = "") {
  await db.query(
    `insert into demands (id, category, origin_type, origin_ref, replacement_noreg, replacement_status)
     values ($1, 'Vokasi', 'VokasiEnded', 'vokasi-1', $2, 'Vokasi New Hire')`,
    [id, replacementNoreg]
  );
}

const ids = () => Array.from({ length: 3 }, () => crypto.randomUUID());

describe("migration_16", () => {
  it("keeps the copy with progress, removes the untouched ones, and logs them", async () => {
    const db = await beforeMigration16();
    const [r1, r2, r3] = ids();
    await review(db, r1);
    await review(db, r2, "Continue");
    await review(db, r3);
    const [d1, d2] = ids();
    await vokasiDemand(db, d1);
    await vokasiDemand(db, d2, "TM900");

    await db.exec(MIGRATION_16);

    expect((await db.query("select id from pkwt_reviews")).rows).toEqual([{ id: r2 }]);
    expect((await db.query("select id from demands")).rows).toEqual([{ id: d2 }]);
    const logged = await db.query<{ table_name: string; kept_id: string }>(
      "select table_name, kept_id from removed_duplicates order by table_name"
    );
    expect(logged.rows).toEqual([
      { table_name: "demands", kept_id: d2 },
      { table_name: "pkwt_reviews", kept_id: r2 },
      { table_name: "pkwt_reviews", kept_id: r2 },
    ]);
  }, 60000);

  it("changes nothing when two copies both have progress", async () => {
    const db = await beforeMigration16();
    const [r1, r2] = ids();
    await review(db, r1, "Continue");
    await review(db, r2, "Terminate");

    await expect(db.exec(MIGRATION_16)).rejects.toThrow(/review PKWT 026001 2026-09-30/);
    expect((await db.query("select id from pkwt_reviews")).rows).toHaveLength(2);
  }, 60000);

  it("then refuses a second copy", async () => {
    const db = await createTestDatabase();
    await review(db, crypto.randomUUID());
    await expect(review(db, crypto.randomUUID())).rejects.toThrow(/duplicate key/);
    await review(db, crypto.randomUUID(), "", "026002"); // someone else is fine

    await vokasiDemand(db, crypto.randomUUID());
    await expect(vokasiDemand(db, crypto.randomUUID())).rejects.toThrow(/duplicate key/);
  }, 60000);
});
