import { describe, expect, it } from "vitest";
import { autoProjectFinishCheck, linkRehiredNoreg, linkedZparNoreg, rehireCandidates } from "@/lib/engine/actions";
import { activateSnapshot, demandStore, projectStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import type { EmployeeRecord } from "@/lib/types";
import { demand, employee, vokasi } from "../helpers/fixtures";

// A project that ended on 2026-08-31 (before "today", 2026-09-25) with one
// MP Project seat, filled by Vokasi alumna Luna (TM001) hired as PKWT New
// Hire. At release, whoever holds the seat with contract left goes to the
// Supply Pool as MP Excess — under the noreg ZPAR knows her by.
function setup(zparEmployees: EmployeeRecord[]) {
  vokasiStore.insert(vokasi());
  zparStore.insert({
    id: "z1",
    period: "2026-07",
    filename: "zpar.csv",
    upload_date: "2026-07-01",
    is_active: false,
    employees: zparEmployees,
  });
  activateSnapshot("z1");
  projectStore.insert({
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
  });
  demandStore.insert(
    demand({
      id: "d1",
      origin_type: "Project",
      origin_ref: "p1",
      outgoing_label: "737D",
      fulfill_date: "2026-06-01",
      replacement_status: "PKWT New Hire",
      replacement_noreg: "TM001",
      replacement_nama: "Luna",
      replacement_batch: "110",
      replacement_dept: "Assy 1",
      replacement_employment_status: "Kontrak",
      status: "Fulfilled",
      fulfillment_confirmed_date: "2026-06-01",
      shop_confirmed_date: "2026-06-02",
    })
  );
}

const newLuna = (noreg: string, masuk = "2026-06-01") =>
  employee({ noreg, nama: "LUNA", gender: "P", status_kontrak: "Kontrak 1.1", tgl_masuk: masuk });

describe("project release with a rehired Vokasi alumna", () => {
  it("links her new ZPAR noreg when every check passes, and releases her once", () => {
    setup([newLuna("026001"), employee({ noreg: "5000999", nama: "Andi" })]);

    autoProjectFinishCheck();

    expect(linkedZparNoreg("TM001")).toBe("026001");
    const pool = utilPoolStore.list();
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ noreg: "026001", type: "PKWT", source: "ProjectFinish", status: "Open" });
    // Still Ongoing: a project only finishes once its released MP are used.
    expect(projectStore.get("p1")?.status).toBe("Ongoing");

    autoProjectFinishCheck(); // running again adds nothing
    expect(utilPoolStore.list()).toHaveLength(1);

    utilPoolStore.update(pool[0].id, { status: "Assigned" });
    autoProjectFinishCheck();
    expect(projectStore.get("p1")?.status).toBe("Finish");
  });

  it("doesn't guess between two matches, and switches once the admin picks one", () => {
    setup([newLuna("026001"), newLuna("026077", "2026-06-15")]);

    autoProjectFinishCheck();

    expect(linkedZparNoreg("TM001")).toBeUndefined();
    expect(
      rehireCandidates(demandStore.get("d1")!)
        .map((c) => c.employee.noreg)
        .sort()
    ).toEqual(["026001", "026077"]);
    expect(utilPoolStore.list()[0]).toMatchObject({ noreg: "TM001" });
    expect(utilPoolStore.list()[0].action_note).toMatch(/belum dikonfirmasi/);

    linkRehiredNoreg("TM001", "026001");
    autoProjectFinishCheck();

    expect(utilPoolStore.list()).toHaveLength(1);
    expect(utilPoolStore.list()[0]).toMatchObject({ noreg: "026001", type: "PKWT" });
  });

  it("never links someone who only shares the name", () => {
    setup([
      employee({
        noreg: "0081234",
        nama: "Luna",
        gender: "P",
        dept: "Paint 2",
        status_kontrak: "Permanen",
        tgl_masuk: "2012-03-01",
      }),
    ]);

    autoProjectFinishCheck();

    expect(linkedZparNoreg("TM001")).toBeUndefined();
    expect(utilPoolStore.list()[0]).toMatchObject({ noreg: "TM001" });
  });
});
