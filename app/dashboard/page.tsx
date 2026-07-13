"use client";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatTile, ProgressBar } from "@/components/ui/StatTile";
import { Select } from "@/components/ui/Form";
import { MonthBarChart } from "@/components/ui/MonthBarChart";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { demandStore, pkwtReviewStore, projectStore, taktStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import {
  compositionByDept,
  compositionByDivision,
  currentMonthKey,
  directorates,
  divisionsOf,
  groupCountBy,
  monthBuckets,
  pkwtEnrollmentStats,
  vokasiEnrollmentStats,
} from "@/lib/engine/dashboard";
import { computeVokasiStatus } from "@/lib/engine/compute";
import type { Demand, EmployeeRecord, PkwtReview, Project, TaktCase, UtilPoolEntry, VokasiRecord } from "@/lib/types";

export default function DashboardPage() {
  const snapshots = useStoreList(zparStore);
  const vokasi = useStoreList(vokasiStore);
  const demands = useStoreList(demandStore);
  const reviews = useStoreList(pkwtReviewStore);
  const projects = useStoreList(projectStore);
  const taktCases = useStoreList(taktStore);
  const utilPool = useStoreList(utilPoolStore);

  const activeSnapshot = snapshots.find((s) => s.isActive);
  const employees = useMemo(() => activeSnapshot?.employees ?? [], [activeSnapshot]);

  const fulfilledVokasiIds = useMemo(
    () => new Set(demands.filter((d) => d.category === "Vokasi" && d.status === "Fulfilled").map((d) => d.origin_ref)),
    [demands]
  );

  if (!activeSnapshot) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <EmptyState text="Belum ada snapshot ZPAR aktif. Upload & aktifkan data di Upload Center terlebih dahulu." />
      </div>
    );
  }

  const permanenCount = employees.filter((e) => e.status_kontrak === "Permanen");
  const kontrakCount = employees.filter((e) => e.status_kontrak !== "Permanen");
  const vokasiActive = vokasi.filter(
    (v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended"
  );

  const genderCount = (arr: { gender: string }[]) => ({
    L: arr.filter((x) => x.gender === "L").length,
    P: arr.filter((x) => x.gender === "P").length,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Snapshot aktif: {activeSnapshot.period} · {activeSnapshot.filename}
        </p>
      </div>

      {/* Block 1 */}
      <Card title="Total Manpower & Status">
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Total Manpower" value={employees.length + vokasiActive.length} emphasize />
          <StatTile
            label="Permanen"
            value={permanenCount.length}
            sub={`L: ${genderCount(permanenCount).L} · P: ${genderCount(permanenCount).P}`}
          />
          <StatTile
            label="Kontrak (PKWT+AKTI)"
            value={kontrakCount.length}
            sub={`L: ${genderCount(kontrakCount).L} · P: ${genderCount(kontrakCount).P}`}
          />
          <StatTile
            label="Vokasi Aktif"
            value={vokasiActive.length}
            sub={`L: ${genderCount(vokasiActive).L} · P: ${genderCount(vokasiActive).P}`}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <CompositionByDivisionBlock employees={employees} vokasi={vokasi} fulfilledVokasiIds={fulfilledVokasiIds} />
        <CompositionByDeptBlock employees={employees} vokasi={vokasi} fulfilledVokasiIds={fulfilledVokasiIds} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PkwtReviewChartBlock reviews={reviews} />
        <VokasiEndedChartBlock vokasi={vokasi} />
      </div>

      <EnrollmentOverviewBlock reviews={reviews} vokasi={vokasi} demands={demands} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProjectSummaryBlock projects={projects} demands={demands} />
        <TaktSummaryBlock taktCases={taktCases} demands={demands} utilPool={utilPool} />
      </div>
    </div>
  );
}

function CompositionByDivisionBlock({
  employees,
  vokasi,
  fulfilledVokasiIds,
}: {
  employees: EmployeeRecord[];
  vokasi: VokasiRecord[];
  fulfilledVokasiIds: Set<string>;
}) {
  const dirs = directorates(employees);
  const [directorat, setDirectorat] = useState(dirs[0] ?? "");
  const dir = dirs.includes(directorat) ? directorat : dirs[0] ?? "";
  const rows = compositionByDivision(employees, vokasi, fulfilledVokasiIds, dir);

  return (
    <Card
      title="Komposisi per Divisi"
      action={
        <Select value={dir} onChange={(e) => setDirectorat(e.target.value)} className="w-48">
          {dirs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      }
    >
      {rows.length === 0 ? (
        <EmptyState text="Tidak ada data." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Divisi</Th>
              <Th>Permanen</Th>
              <Th>Kontrak</Th>
              <Th>Vokasi</Th>
              <Th>L</Th>
              <Th>P</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <Td>{r.key}</Td>
                <Td>{r.permanen}</Td>
                <Td>{r.kontrak}</Td>
                <Td>{r.vokasi}</Td>
                <Td>{r.laki}</Td>
                <Td>{r.perempuan}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}

function CompositionByDeptBlock({
  employees,
  vokasi,
  fulfilledVokasiIds,
}: {
  employees: EmployeeRecord[];
  vokasi: VokasiRecord[];
  fulfilledVokasiIds: Set<string>;
}) {
  const divs = divisionsOf(employees);
  const [division, setDivision] = useState(divs[0] ?? "");
  const div = divs.includes(division) ? division : divs[0] ?? "";
  const rows = compositionByDept(employees, vokasi, fulfilledVokasiIds, div);

  return (
    <Card
      title="Komposisi per Department"
      action={
        <Select value={div} onChange={(e) => setDivision(e.target.value)} className="w-48">
          {divs.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      }
    >
      {rows.length === 0 ? (
        <EmptyState text="Tidak ada data." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Department</Th>
              <Th>Permanen</Th>
              <Th>Kontrak</Th>
              <Th>Vokasi</Th>
              <Th>L</Th>
              <Th>P</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <Td>{r.key}</Td>
                <Td>{r.permanen}</Td>
                <Td>{r.kontrak}</Td>
                <Td>{r.vokasi}</Td>
                <Td>{r.laki}</Td>
                <Td>{r.perempuan}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}

function PkwtReviewChartBlock({ reviews }: { reviews: PkwtReview[] }) {
  const { buckets, byMonth } = monthBuckets(reviews, (r) => r.tgl_review?.slice(0, 7));
  const [selected, setSelected] = useState(currentMonthKey());
  const detailItems = byMonth.get(selected) ?? [];
  const byDept = groupCountBy(detailItems, (r) => r.dept);

  return (
    <Card title="PKWT Review per Bulan">
      <div className="grid gap-4 md:grid-cols-2">
        <MonthBarChart data={buckets} selectedMonth={selected} onSelect={setSelected} />
        <div>
          <div className="text-xs font-semibold text-slate-500">Detail — {selected}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">orang review</span>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {byDept.length === 0 && <li className="text-slate-400">Tidak ada review bulan ini.</li>}
            {byDept.map((d) => (
              <li key={d.key} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300">{d.key}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function VokasiEndedChartBlock({ vokasi }: { vokasi: VokasiRecord[] }) {
  const { buckets, byMonth } = monthBuckets(vokasi, (v) => v.tgl_ended?.slice(0, 7));
  const [selected, setSelected] = useState(currentMonthKey());
  const detailItems = byMonth.get(selected) ?? [];
  const byDept = groupCountBy(detailItems, (v) => v.dept);

  return (
    <Card title="Vokasi Ended per Bulan">
      <div className="grid gap-4 md:grid-cols-2">
        <MonthBarChart data={buckets} selectedMonth={selected} onSelect={setSelected} />
        <div>
          <div className="text-xs font-semibold text-slate-500">Detail — {selected}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">ended</span>
          </div>
          <ul className="mt-3 space-y-1 text-sm">
            {byDept.length === 0 && <li className="text-slate-400">Tidak ada vokasi ended bulan ini.</li>}
            {byDept.map((d) => (
              <li key={d.key} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300">{d.key}</span>
                <span className="font-medium text-slate-800 dark:text-slate-100">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function EnrollmentOverviewBlock({
  reviews,
  vokasi,
  demands,
}: {
  reviews: PkwtReview[];
  vokasi: VokasiRecord[];
  demands: Demand[];
}) {
  const pkwt = pkwtEnrollmentStats(reviews, demands);
  const vok = vokasiEnrollmentStats(vokasi, demands);
  return (
    <Card title="Enrollment Overview">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-500">PKWT</h4>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Review Bulan Ini" value={pkwt.reviewsThisMonth} emphasize />
            <StatTile label="Terminate / Ended" value={pkwt.terminatedCount} emphasize />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">Progress Replacement</div>
            <ProgressBar percent={pkwt.percent} />
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold text-slate-500">Vokasi</h4>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Ended Bulan Ini" value={vok.endedThisMonth} emphasize />
            <StatTile label="Sudah Fulfilled" value={vok.fulfilled} />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-xs text-slate-500">Progress Replacement</div>
            <ProgressBar percent={vok.percent} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function ProjectSummaryBlock({
  projects,
  demands,
}: {
  projects: Project[];
  demands: Demand[];
}) {
  const ongoing = projects.filter((p) => p.status === "Ongoing");
  return (
    <Card title="Project Monitoring Summary">
      {ongoing.length === 0 ? (
        <EmptyState text="Tidak ada project Ongoing." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {ongoing.map((p) => {
            const gap = demands.filter((d) => p.demand_ids.includes(d.id) && d.status === "Open").length;
            return (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{p.name}</div>
                  <div className="text-xs text-slate-500">selesai {p.end_date}</div>
                </div>
                {gap === 0 ? (
                  <Badge tone="green">✅ MP Terpenuhi</Badge>
                ) : (
                  <Badge tone="amber">⚠️ Perlu {gap} MP lagi</Badge>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function TaktSummaryBlock({
  taktCases,
  demands,
  utilPool,
}: {
  taktCases: TaktCase[];
  demands: Demand[];
  utilPool: UtilPoolEntry[];
}) {
  const plants: ("Plant 1" | "Plant 2")[] = ["Plant 1", "Plant 2"];
  return (
    <Card title="Takt Time Monitoring Summary">
      <div className="space-y-3">
        {plants.map((plant) => {
          const cases = taktCases.filter((t) => t.plant === plant).sort((a, b) => b.date.localeCompare(a.date));
          const last = cases[0];
          if (!last) {
            return (
              <div key={plant} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                <span className="font-medium text-slate-700 dark:text-slate-200">{plant}</span>
                <span className="text-slate-400">Belum ada data</span>
              </div>
            );
          }
          let ok: boolean;
          if (last.category === "up") {
            ok = demands.filter((d) => last.demand_ids.includes(d.id)).every((d) => d.status === "Fulfilled");
          } else {
            ok = utilPool.filter((u) => last.released_pool_ids.includes(u.id)).every((u) => u.status !== "Open");
          }
          const label =
            last.category === "up"
              ? ok
                ? "✅ MP Terpenuhi"
                : "⚠️ Masih Perlu Supply"
              : ok
                ? "✅ Semua MP Sudah Diutilisasi"
                : "⚠️ Masih Ada MP Belum Diutilisasi";
          return (
            <div key={plant} className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700 dark:text-slate-200">{plant}</span>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{last.takt_after}s</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Kasus terakhir: {last.category === "up" ? "Takt Up" : "Takt Down"} ({last.date})
                </span>
                <Badge tone={ok ? "green" : "amber"}>{label}</Badge>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
