import { describe, expect, it, vi } from "vitest";
import { calls, fakeClient, setTableRows, setWriteResponder } from "../helpers/fakeSupabase";
import { demand, employee, vokasi } from "../helpers/fixtures";

// The daily server job: loads the database, runs the engine's recurring
// work, waits for every write, and reports. "Today" is 2026-09-25.

describe("daily jobs", () => {
  it("creates what's due and reports it", async () => {
    setTableRows("zpar_snapshots", [
      {
        id: "snap",
        period: "2026-09",
        filename: "z.csv",
        upload_date: "2026-09-01",
        is_active: true,
        employee_count: 1,
        employees: [employee({ noreg: "026001", status_kontrak: "Kontrak 1.1", tgl_masuk: "2024-10-01" })],
      },
    ]);
    // A Vokasi batch ending this month.
    setTableRows("vokasi_records", [vokasi({ id: "v-sep", noreg: "TM900", tgl_masuk: "2026-04-01", tgl_ended: "2026-09-30" })]);
    // A project whose MP Project row was released on 2026-08-31, its seat
    // held by someone with contract left.
    setTableRows("projects", [
      {
        id: "p1",
        name: "737D",
        start_date: "2026-06-01",
        end_date: "2026-08-31",
        status: "Ongoing",
        demand_ids: ["d1"],
        rows: [
          {
            id: "r1",
            division: "Assy",
            dept: "Assy 1",
            status_mp: "PKWT",
            mp_role: "Project",
            qty: 1,
            fulfill_date: "2026-06-01",
            release_date: "2026-08-31",
            no_release: false,
            demand_ids: ["d1"],
          },
        ],
      },
    ]);
    setTableRows("demands", [
      demand({
        id: "d1",
        origin_type: "Project",
        origin_ref: "p1",
        outgoing_label: "737D",
        replacement_status: "PKWT New Hire",
        replacement_noreg: "026001",
        replacement_nama: "Andi",
        status: "Fulfilled",
        fulfillment_confirmed_date: "2026-06-01",
        shop_confirmed_date: "2026-06-02",
      }),
    ]);

    vi.resetModules();
    const { runDailyJobs } = await import("@/lib/jobs/daily");
    const repo = await import("@/lib/repo");
    const report = await runDailyJobs(fakeClient as never);

    expect(report).toMatchObject({
      pkwtReviewsCreated: 1,
      vokasiEndedDemandsCreated: 1,
      supplyPoolEntriesAdded: 1,
      failures: [],
    });
    const inserted = calls.filter((c) => c.op === "insert").map((c) => c.table);
    expect(inserted).toEqual(expect.arrayContaining(["pkwt_reviews", "demands", "util_pool"]));
    // Nothing read with the service role stays in the server's memory.
    expect(repo.demandStore.list()).toHaveLength(0);
    expect(repo.zparStore.list()).toHaveLength(0);
  });

  it("reports writes the database refused", async () => {
    setTableRows("zpar_snapshots", [
      {
        id: "snap",
        period: "2026-09",
        filename: "z.csv",
        upload_date: "2026-09-01",
        is_active: true,
        employee_count: 1,
        employees: [employee({ noreg: "026001", status_kontrak: "Kontrak 1.1", tgl_masuk: "2024-10-01" })],
      },
    ]);
    setWriteResponder(() => ({ data: null, error: { message: "permission denied" } }));

    vi.resetModules();
    const { runDailyJobs } = await import("@/lib/jobs/daily");
    const report = await runDailyJobs(fakeClient as never);

    expect(report.pkwtReviewsCreated).toBe(0);
    expect(report.failures).toContain("pkwt_reviews: permission denied");
  });
});

describe("GET /api/jobs/daily", () => {
  async function call(authorization?: string) {
    vi.resetModules();
    const { GET } = await import("@/app/api/jobs/daily/route");
    return GET(new Request("http://localhost/api/jobs/daily", { headers: authorization ? { authorization } : {} }));
  }

  it("refuses anyone without the cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
  });

  it("refuses everyone when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
  });

  it("says what's missing when the service role key isn't set", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:9");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const res = await call("Bearer s3cret");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" });
  });
});
