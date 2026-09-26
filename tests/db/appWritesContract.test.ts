import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  createKaizenSupply,
  createManualDemand,
  createProject,
  createTaktUp,
  ensureVokasiEndedDemands,
  generatePkwtReviews,
} from "@/lib/engine/actions";
import { activateSnapshot, vokasiStore, zparStore } from "@/lib/repo";
import { calls } from "../helpers/fakeSupabase";
import { employee, vokasi } from "../helpers/fixtures";
import { actAs, createTestDatabase } from "./testDatabase";

// The contract between the app and the database: everything the app sends
// when creating records must be accepted by the real schema (after every
// migration). A field the database lacks — like the "plant" column before
// migration_11 was run — fails here instead of in production.

let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
}, 60000);

function insertedRows(): { table: string; row: Record<string, unknown> }[] {
  return calls
    .filter((c) => c.op === "insert" && c.table)
    .flatMap((c) =>
      (Array.isArray(c.payload) ? c.payload : [c.payload]).map((row) => ({
        table: c.table!,
        row: row as Record<string, unknown>,
      }))
    );
}

describe("what the app writes, the database accepts", () => {
  it("covers snapshots, Vokasi, reviews, projects, takt, manual demands and the Supply Pool", async () => {
    zparStore.insert({
      id: crypto.randomUUID(),
      period: "2026-09",
      filename: "zpar.csv",
      upload_date: "2026-09-01T00:00:00Z",
      is_active: false,
      employees: [employee({ noreg: "026001", status_kontrak: "Kontrak 1.1", tgl_masuk: "2024-10-01" })],
    });
    activateSnapshot(zparStore.list()[0].id);
    vokasiStore.insert(vokasi({ id: crypto.randomUUID(), tgl_masuk: "2026-04-01", tgl_ended: "2026-09-30" }));
    await generatePkwtReviews();
    await ensureVokasiEndedDemands();
    createProject({
      name: "737D",
      sop_date: "2026-10-01",
      rows: [
        {
          division: "Assy",
          dept: "Assy 1",
          status_mp: "PKWT",
          mp_role: "Project",
          qty: 2,
          fulfill_date: "2026-10-01",
          release_date: "2027-12-31",
          no_release: false,
        },
      ],
    });
    createTaktUp({
      plant: "Plant 1",
      date: "2026-11-01",
      takt_before: 60,
      takt_after: 55,
      need_rows: [
        { division: "Assy", dept: "Assy 1", status_mp: "PKWT", mp_role: "Project", qty: 1, fulfill_date: "2026-11-01" },
      ],
    });
    createManualDemand({
      category: "PKWT",
      origin_type: "Resign",
      outgoing_noreg: "026009",
      outgoing_nama: "Budi",
      div: "Assy",
      dept: "Assy 1",
      fulfill_date: "2026-10-15",
    });
    createKaizenSupply({
      laborGroup: "A/F",
      persons: [
        {
          noreg: "026010",
          nama: "Rina",
          type: "PKWT",
          div: "Assy",
          dept: "Assy 1",
          activity: "Line balancing",
          releaseDate: "2026-10-01",
        },
      ],
    });

    const rows = insertedRows();
    const tables = new Set(rows.map((r) => r.table));
    for (const t of ["zpar_snapshots", "vokasi_records", "pkwt_reviews", "demands", "projects", "takt_cases", "util_pool"]) {
      expect(tables, `no ${t} insert was exercised`).toContain(t);
    }

    await actAs(db, "admin");
    await expect(
      db.query("select apply_changes($1::jsonb)", [
        JSON.stringify(rows.map((r) => ({ op: "insert", table: r.table, row: r.row }))),
      ])
    ).resolves.toBeDefined();
  }, 60000);
});
