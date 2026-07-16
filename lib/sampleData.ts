// Demo data generator — lets a fresh install of M-TRACK be explored without
// requiring real ZPAR/Vokasi exports first. Purely additive helper, not part
// of the core data model.
import { addDays, addMonths, format, subMonths } from "date-fns";
import { genId } from "./storage";
import { zparStore, vokasiStore, activateSnapshot, clearAllData } from "./repo";
import {
  createProject,
  createTaktDown,
  createTaktUp,
  ensureVokasiEndedDemands,
  generatePkwtReviews,
  setDemandReplacementByNoreg,
  setReviewResult,
} from "./engine/actions";
import { demandStore, pkwtReviewStore } from "./repo";
import type { EmployeeRecord, Gender, StatusKontrak, VokasiRecord } from "./types";

const DIRECTORATES: Record<string, { division: string; plant: string; depts: string[] }[]> = {
  Manufacturing: [
    { division: "Assembly Division", plant: "Plant 1", depts: ["Assembly Line 1", "Assembly Line 2"] },
    { division: "Body Shop Division", plant: "Plant 2", depts: ["Body Shop A", "Body Shop B"] },
  ],
  Quality: [{ division: "QA Division", plant: "Plant 1", depts: ["QA Incoming", "QA Final"] }],
};

const iso = (d: Date) => format(d, "yyyy-MM-dd");
const now = () => new Date();

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

const LABOR_TYPE_CYCLE = ["A", "B1", "B2", "B3", "B4", "C1", "C2", "D", "E1", "E2", "F", "T"];
const POSISI_CYCLE = [
  "Team Member",
  "Team Member",
  "Team Leader",
  "Staff",
  "Group Leader",
  "Team Expert",
  "Section Head",
  "Senior Officer",
  "Group Expert",
  "Department Head",
];

export function seedSampleData(): void {
  clearAllData();

  // --- ZPAR snapshot ------------------------------------------------------
  const employees: EmployeeRecord[] = [];
  const contractSpread: { status: StatusKontrak; monthsAgoAtMasuk: number }[] = [
    { status: "Kontrak 1.1", monthsAgoAtMasuk: 23 }, // review next month
    { status: "Kontrak 1.1", monthsAgoAtMasuk: 24 }, // review this month
    { status: "Kontrak 1.2", monthsAgoAtMasuk: 22 },
    { status: "Kontrak 1.2", monthsAgoAtMasuk: 24 }, // review this month
    { status: "Kontrak 2", monthsAgoAtMasuk: 35 },
    { status: "Kontrak 2", monthsAgoAtMasuk: 36 }, // review this month
    { status: "AKTI", monthsAgoAtMasuk: 12 },
    { status: "Permanen", monthsAgoAtMasuk: 60 },
  ];

  let n = 0;
  for (const [directorat, divisions] of Object.entries(DIRECTORATES)) {
    for (const div of divisions) {
      for (const dept of div.depts) {
        for (let i = 0; i < 5; i++) {
          const spread = pick(contractSpread, n);
          const gender: Gender = n % 3 === 0 ? "P" : "L";
          n++;
          employees.push({
            noreg: `EMP${String(n).padStart(4, "0")}`,
            nama: `Karyawan ${n}`,
            labor_type: pick(LABOR_TYPE_CYCLE, n),
            tgl_masuk: iso(subMonths(now(), spread.monthsAgoAtMasuk)),
            status_kontrak: spread.status,
            eg: "Active",
            directorat,
            division: div.division,
            dept,
            section: dept,
            line: `Line ${(n % 3) + 1}`,
            tgl_lahir: iso(subMonths(now(), 300 + n)),
            gender,
            plant: div.plant,
            posisi_struktural: pick(POSISI_CYCLE, n),
          });
        }
      }
    }
  }

  const snapshot = {
    id: genId("zpar"),
    period: format(now(), "yyyy-MM"),
    filename: "sample-zpar.xlsx",
    upload_date: new Date().toISOString(),
    is_active: false,
    employees,
  };
  zparStore.insert(snapshot);
  activateSnapshot(snapshot.id);

  // A few extra historical snapshots (same roster) so the Manpower Movement
  // chart on the Dashboard has more than one populated bar out of the box.
  for (let back = 1; back <= 3; back++) {
    const pastPeriod = format(subMonths(now(), back), "yyyy-MM");
    zparStore.insert({
      id: genId("zpar"),
      period: pastPeriod,
      filename: `sample-zpar-${pastPeriod}.xlsx`,
      upload_date: iso(subMonths(now(), back)),
      is_active: false,
      employees,
    });
  }

  // --- Vokasi cumulative database -----------------------------------------
  const vokasiBatches: { batch: string; monthsAgo: number; endedInMonths: number[] }[] = [
    { batch: "Batch 2024-A", monthsAgo: 10, endedInMonths: [-1, 0, 1] },
    { batch: "Batch 2024-B", monthsAgo: 6, endedInMonths: [1, 2] },
  ];

  let v = 0;
  for (const batch of vokasiBatches) {
    const records: VokasiRecord[] = [];
    for (const [, divisions] of Object.entries(DIRECTORATES)) {
      for (const div of divisions) {
        for (const dept of div.depts.slice(0, 1)) {
          v++;
          const endedOffset = pick(batch.endedInMonths, v);
          records.push({
            id: genId("vokasi"),
            noreg: `VOK${String(v).padStart(4, "0")}`,
            nama: `Vokasi ${v}`,
            batch: batch.batch,
            div: div.division,
            dept,
            lokasi: div.plant,
            tgl_masuk: iso(subMonths(now(), batch.monthsAgo)),
            tgl_ended: iso(addMonths(now(), endedOffset)),
            utilisasi: dept,
            status_saat_ini: "Active",
            gender: v % 2 === 0 ? "P" : "L",
            labor_type: pick(LABOR_TYPE_CYCLE, v),
            upload_date: iso(subMonths(now(), batch.monthsAgo)),
          });
        }
      }
    }
    vokasiStore.insertMany(records);
  }

  // --- Derived demand pool --------------------------------------------------
  generatePkwtReviews();
  ensureVokasiEndedDemands();

  // Terminate one PKWT review due this month, to populate the PKWT Demand section.
  const dueThisMonth = pkwtReviewStore
    .list()
    .find((r) => r.tgl_review.slice(0, 7) === format(now(), "yyyy-MM"));
  if (dueThisMonth) setReviewResult(dueThisMonth.id, "Terminate");
  const dueContinue = pkwtReviewStore
    .list()
    .find((r) => r.id !== dueThisMonth?.id && r.tgl_review.slice(0, 7) === format(now(), "yyyy-MM"));
  if (dueContinue) setReviewResult(dueContinue.id, "Continue");

  // Fulfill one Vokasi-ended demand candidate manually to show progress.
  const openVokasiDemand = demandStore.list().find((d) => d.category === "Vokasi" && d.status === "Open");
  const freeVokasi = vokasiStore
    .list()
    .find((r) => r.dept === openVokasiDemand?.dept && r.noreg !== openVokasiDemand?.outgoing_noreg);
  if (openVokasiDemand && freeVokasi) {
    setDemandReplacementByNoreg(openVokasiDemand.id, freeVokasi.noreg);
  }

  // --- Project (ongoing, already past due -> demonstrates auto-finish) -----
  const anyDivision = DIRECTORATES.Manufacturing[0];
  createProject({
    name: "Project Alpha",
    start_date: iso(subMonths(now(), 3)),
    end_date: iso(addDays(now(), 20)),
    rows: [
      { division: anyDivision.division, dept: anyDivision.depts[0], status_mp: "Vokasi", qty: 2, fulfill_date: iso(addDays(now(), 25)) },
      { division: anyDivision.division, dept: anyDivision.depts[1], status_mp: "PKWT", qty: 1, fulfill_date: iso(addDays(now(), 30)) },
    ],
  });

  const finishedProject = createProject({
    name: "Project Beta (selesai)",
    start_date: iso(subMonths(now(), 6)),
    end_date: iso(subMonths(now(), 1)),
    rows: [
      { division: anyDivision.division, dept: anyDivision.depts[0], status_mp: "Vokasi", qty: 1, fulfill_date: iso(subMonths(now(), 2)) },
    ],
  });
  const betaDemand = demandStore.list().find((d) => finishedProject.demand_ids.includes(d.id));
  const betaVokasi = vokasiStore.list().find((r) => r.dept === betaDemand?.dept);
  if (betaDemand && betaVokasi) setDemandReplacementByNoreg(betaDemand.id, betaVokasi.noreg);

  // --- Takt Time -------------------------------------------------------------
  createTaktUp({
    plant: "Plant 1",
    date: iso(subMonths(now(), 1)),
    takt_before: 62,
    takt_after: 58,
    need_rows: [{ division: anyDivision.division, dept: anyDivision.depts[0], status_mp: "Vokasi", qty: 2, fulfill_date: iso(addDays(now(), 10)) }],
  });

  createTaktDown({
    plant: "Plant 2",
    date: iso(subMonths(now(), 2)),
    takt_before: 70,
    takt_after: 75,
    released_persons: [
      { noreg: employees[10].noreg, nama: employees[10].nama, type: "PKWT", dept: employees[10].dept },
    ],
  });
}
