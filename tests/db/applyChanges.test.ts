import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { actAs, asOwner, createTestDatabase } from "./testDatabase";

let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
}, 60000);

const project = (id: string, name = "737D") => ({
  id,
  name,
  start_date: "2026-10-01",
  end_date: "2027-12-31",
  status: "Ongoing",
  rows: [],
  demand_ids: [],
});
const demand = (id: string, origin_ref: string) => ({
  id,
  category: "PKWT",
  origin_type: "Project",
  origin_ref,
  fulfill_date: "2026-10-01",
});

async function apply(ops: unknown[]) {
  await db.query("select apply_changes($1::jsonb)", [JSON.stringify(ops)]);
}
async function count(table: string, where = "true"): Promise<number> {
  await asOwner(db);
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from ${table} where ${where}`);
  return rows[0].n;
}

describe("apply_changes", () => {
  it("saves several changes together", async () => {
    await actAs(db, "admin");
    const p = crypto.randomUUID();
    const d1 = crypto.randomUUID();
    const d2 = crypto.randomUUID();
    await apply([
      { op: "insert", table: "projects", row: project(p) },
      { op: "insert", table: "demands", row: demand(d1, p) },
      { op: "insert", table: "demands", row: demand(d2, p) },
      { op: "update", table: "projects", id: p, patch: { demand_ids: [d1, d2] } },
    ]);
    expect(await count("demands", `origin_ref = '${p}'`)).toBe(2);
    await asOwner(db);
    const { rows } = await db.query<{ demand_ids: string[]; created_at: string }>(
      `select p.demand_ids, (select created_at from demands where id = '${d1}') as created_at from projects p where id = '${p}'`
    );
    expect(rows[0].demand_ids).toEqual([d1, d2]);
    expect(rows[0].created_at).toBeTruthy(); // a field left out keeps its default
  });

  it("saves nothing when one change fails", async () => {
    await actAs(db, "admin");
    const p = crypto.randomUUID();
    await expect(
      apply([
        { op: "insert", table: "projects", row: project(p, "Half") },
        { op: "insert", table: "demands", row: { ...demand(crypto.randomUUID(), p), status: "Nope" } }, // breaks a check
      ])
    ).rejects.toThrow();
    expect(await count("projects", `id = '${p}'`)).toBe(0);
  });

  it("names a column the table doesn't have (e.g. a migration not run yet)", async () => {
    await actAs(db, "admin");
    await expect(
      apply([{ op: "insert", table: "projects", row: { ...project(crypto.randomUUID()), colour: "red" } }])
    ).rejects.toThrow(/projects has no column colour/);
  });

  it("follows row level security: only admin writes directly", async () => {
    await actAs(db, "hr");
    await expect(apply([{ op: "insert", table: "projects", row: project(crypto.randomUUID(), "By HR") }])).rejects.toThrow(
      /row-level security/
    );
    expect(await count("projects", "name = 'By HR'")).toBe(0);
  });

  it("refuses an update it can't make, instead of silently changing nothing", async () => {
    await actAs(db, "admin");
    const p = crypto.randomUUID();
    await apply([{ op: "insert", table: "projects", row: project(p, "Mine") }]);
    await actAs(db, "shop");
    await expect(apply([{ op: "update", table: "projects", id: p, patch: { name: "Changed" } }])).rejects.toThrow(
      /not found or not permitted/
    );
  });

  it("upserts and deletes", async () => {
    await actAs(db, "admin");
    const p = crypto.randomUUID();
    await apply([{ op: "upsert", table: "projects", row: project(p, "First") }]);
    await apply([{ op: "upsert", table: "projects", row: project(p, "Second") }]);
    await asOwner(db);
    expect((await db.query<{ name: string }>(`select name from projects where id = '${p}'`)).rows[0].name).toBe("Second");
    await actAs(db, "admin");
    await apply([{ op: "delete", table: "projects", id: p }]);
    expect(await count("projects", `id = '${p}'`)).toBe(0);
  });

  it("only touches the app's tables", async () => {
    await actAs(db, "admin");
    await expect(apply([{ op: "delete", table: "profiles", id: crypto.randomUUID() }])).rejects.toThrow(/unknown table profiles/);
  });

  it("records itself in app_migrations", async () => {
    await asOwner(db);
    expect((await db.query("select 1 from app_migrations where name = 'migration_15'")).rows).toHaveLength(1);
  });
});
