import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, asOwner, createTestDatabase } from "./testDatabase";

// migration_20: what the browser keeps of each large table. Old, finished
// rows stay out; anything still running, recent, or referenced by
// something that is, stays in.

let db: PGlite;
beforeEach(async () => {
  db = await createTestDatabase();
}, 60000);

const OLD = "(now() - interval '3 years')";
const RECENT = "(now() - interval '1 month')";

async function demand(fields: Record<string, string | null>, when: string = OLD): Promise<string> {
  const id = crypto.randomUUID();
  const row: Record<string, string | null> = {
    category: "PKWT",
    origin_type: "Resign",
    status: "Fulfilled",
    replacement_status: "PKWT New Hire",
    ...fields,
  };
  // Every date at `when`, then the fields given (which may clear one).
  await db.query(
    `insert into demands (id, category, origin_type, created_at, fulfill_date, tgl_ended_outgoing,
       fulfillment_confirmed_date, shop_confirmed_date)
     values ($1, 'PKWT', 'Resign', ${when}, ${when}::date, ${when}::date, ${when}::date, ${when}::date)`,
    [id]
  );
  const cols = Object.keys(row);
  await db.query(`update demands set ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} where id = $1`, [
    id,
    ...cols.map((c) => row[c]),
  ]);
  return id;
}

async function ids(fn: string): Promise<Set<string>> {
  await actAs(db, "shop");
  const res = await db.query<{ id: string }>(`select id from ${fn}()`);
  await asOwner(db);
  return new Set(res.rows.map((r) => r.id));
}

describe("demands_working_set", () => {
  it("keeps open and recent demands, drops old finished ones", async () => {
    const oldDone = await demand({});
    const oldOpen = await demand({ status: "Open" });
    const oldNotReceived = await demand({ shop_confirmed_date: null });
    const oldNoReplace = await demand({ status: "Open", replacement_status: "No Replace", shop_confirmed_date: null });
    await db.query("update demands set status = 'Fulfilled' where id = $1", [oldNoReplace]);
    const recentDone = await demand({}, RECENT);

    const set = await ids("demands_working_set");
    expect(set.has(oldDone)).toBe(false);
    expect(set.has(oldNoReplace)).toBe(false);
    expect(set.has(oldOpen)).toBe(true);
    expect(set.has(oldNotReceived)).toBe(true);
    expect(set.has(recentDone)).toBe(true);
  });

  it("keeps every project seat and the whole chain that refilled it", async () => {
    const seat = await demand({ origin_type: "Project", origin_ref: "p1", replacement_noreg: "V1" });
    const refill1 = await demand({ origin_type: "VokasiEnded", origin_ref: "v1", outgoing_noreg: "V1", replacement_noreg: "P2" });
    const refill2 = await demand({ origin_type: "PkwtTerminate", origin_ref: "r2", outgoing_noreg: "P2", replacement_noreg: "" });
    const unrelated = await demand({
      origin_type: "VokasiEnded",
      origin_ref: "v7",
      outgoing_noreg: "V7",
      replacement_noreg: "P8",
    });

    const set = await ids("demands_working_set");
    expect([seat, refill1, refill2].every((id) => set.has(id))).toBe(true);
    expect(set.has(unrelated)).toBe(false);
  });

  it("follows a rehired alumnus to their new ZPAR noreg", async () => {
    await demand({ origin_type: "TaktUp", origin_ref: "t1", replacement_noreg: "V9" });
    await db.query(
      `insert into value_mappings (dataset, field, raw_value, normalized_raw, mapped_value)
       values ('vokasi', 'noreg_zpar', 'v9', 'V9', 'Z9')`
    );
    const terminated = await demand({ origin_type: "PkwtTerminate", outgoing_noreg: "Z9" });
    expect((await ids("demands_working_set")).has(terminated)).toBe(true);
  });
});

describe("pkwt_reviews_working_set", () => {
  async function review(tglReview: string, result = ""): Promise<string> {
    const id = crypto.randomUUID();
    await db.query(
      `insert into pkwt_reviews (id, noreg, nama, status_kontrak, div, dept, tgl_masuk, tgl_review, review_result)
       values ($1, $2, 'Budi', 'Kontrak 1.1', 'Assy', 'Assy 1', '2020-01-01', ${tglReview}::date, $3)`,
      [id, `N${Math.random()}`, result]
    );
    return id;
  }

  it("keeps recent and pending reviews and the review behind an active demand", async () => {
    const oldDone = await review(OLD, "Continue");
    const oldPending = await review(OLD);
    const recent = await review(RECENT, "Continue");
    const oldTerminated = await review(OLD, "Terminate");
    await demand({ origin_type: "PkwtTerminate", origin_ref: oldTerminated, status: "Open" });

    const set = await ids("pkwt_reviews_working_set");
    expect(set.has(oldDone)).toBe(false);
    expect([oldPending, recent, oldTerminated].every((id) => set.has(id))).toBe(true);
  });
});

describe("vokasi_records_working_set", () => {
  async function vokasi(noreg: string, ended: string, batch = "B1"): Promise<string> {
    const id = crypto.randomUUID();
    await db.query(
      `insert into vokasi_records (id, noreg, nama, batch, div, dept, tgl_masuk, tgl_ended)
       values ($1, $2, 'Rina', $3, 'Assy', 'Assy 1', (${ended}::date - 180), ${ended}::date)`,
      [id, noreg, batch]
    );
    return id;
  }

  it("keeps running Vokasi and anyone an active demand is about", async () => {
    const oldEnded = await vokasi("V1", OLD);
    const running = await vokasi("V2", "(now() + interval '2 months')");
    const replacement = await vokasi("V3", OLD);
    const source = await vokasi("V4", OLD);
    await demand({ status: "Open", replacement_noreg: "V3" });
    await demand({ origin_type: "VokasiEnded", origin_ref: source, status: "Open" });

    const set = await ids("vokasi_records_working_set");
    expect(set.has(oldEnded)).toBe(false);
    expect([running, replacement, source].every((id) => set.has(id))).toBe(true);
  });

  it("summarises every batch without reading every record", async () => {
    await vokasi("V1", OLD, "B-old");
    await vokasi("V2", OLD, "B-old");
    await vokasi("V3", RECENT, "B-new");
    await actAs(db, "shop");
    const res = await db.query<{ batch: string; records: number }>("select batch, records from vokasi_batch_summary()");
    expect(Object.fromEntries(res.rows.map((r) => [r.batch, Number(r.records)]))).toEqual({ "B-old": 2, "B-new": 1 });
  });
});

describe("util_pool_working_set", () => {
  async function entry(fields: Record<string, string>, entered: string = OLD): Promise<string> {
    const id = crypto.randomUUID();
    const row = { noreg: `N${Math.random()}`, nama: "Andi", type: "PKWT", source: "Kaizen", status: "Assigned", ...fields };
    const cols = Object.keys(row);
    await db.query(
      `insert into util_pool (id, entered_pool_date, ${cols.join(", ")}) values ($1, ${entered}::date, ${cols.map((_, i) => `$${i + 2}`).join(", ")})`,
      [id, ...Object.values(row)]
    );
    return id;
  }

  it("keeps open, recent, project and takt entries and whoever fills an active demand", async () => {
    const oldAssigned = await entry({});
    const open = await entry({ status: "Open" });
    const recent = await entry({}, RECENT);
    const project = await entry({ source: "ProjectFinish", source_label: "737D" });
    const takt = await entry({ source: "TaktDown" });
    await db.query(
      `insert into takt_cases (plant, date, category, takt_before, takt_after, released_pool_ids)
       values ('Plant 1', '2020-01-01', 'down', 60, 65, $1::jsonb)`,
      [JSON.stringify([takt])]
    );
    const filling = await entry({ noreg: "P5" });
    await demand({ status: "Open", replacement_noreg: "P5" });

    const set = await ids("util_pool_working_set");
    expect(set.has(oldAssigned)).toBe(false);
    expect([open, recent, project, takt, filling].every((id) => set.has(id))).toBe(true);
  });
});
