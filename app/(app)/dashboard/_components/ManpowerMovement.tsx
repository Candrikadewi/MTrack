"use client";
// Manpower Movement: headcount per status across periods, and who joined, left or moved
// between two periods.
import { useMemo } from "react";
import { format } from "date-fns";
import { useSessionState } from "@/lib/useSessionState";
import { UserPlus, UserMinus, Shuffle, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Form";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { CompositionChart } from "@/components/ui/CompositionChart";
import { Badge, type Tone as BadgeTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Table";
import {
  diffEmployees,
  filterByLaborTypeStatus,
  fiscalYearMonths,
  manpowerMovementByFiscalYear,
  previousPeriodWithData,
  type EmployeeDiff,
  type MovementStatus,
} from "@/lib/engine/dashboard";
import { LABOR_TYPES } from "@/lib/types";
import type { Demand, EmployeeRecord, PkwtReview, VokasiRecord } from "@/lib/types";

const MOVEMENT_STATUSES: MovementStatus[] = ["Permanen", "Kontrak", "Vokasi"];

export function ManpowerMovementBlock({
  snapshotsByPeriod,
  vokasi,
  reviews,
  demands,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  snapshotsByPeriod: Map<string, EmployeeRecord[]>;
  vokasi: VokasiRecord[];
  reviews: PkwtReview[];
  demands: Demand[];
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const [selLaborTypes, setSelLaborTypes] = useSessionState<string[]>("dash.movement.laborTypes", []);
  const [selStatuses, setSelStatuses] = useSessionState<MovementStatus[]>("dash.movement.statuses", []);
  const [selPeriods, setSelPeriods] = useSessionState<string[]>("dash.movement.periods", []);

  // Default window is the fiscal year around real "today"; the Periode
  // filter swaps it for any mix of months — every uploaded snapshot (e.g.
  // Mar 2019…Mar 2025) plus this FY's months — drawn oldest → newest.
  const refDate = useMemo(() => new Date(), []);
  const periodOptions = useMemo(
    () =>
      Array.from(new Set([...snapshotsByPeriod.keys(), ...fiscalYearMonths(refDate)]))
        .sort()
        .reverse(),
    [snapshotsByPeriod, refDate]
  );
  const movementRows = useMemo(
    () =>
      manpowerMovementByFiscalYear(
        snapshotsByPeriod,
        vokasi,
        {
          org: { directorates: selDirectorates, divisions: selDivisions, depts: selDepts },
          laborTypes: selLaborTypes,
          statuses: selStatuses,
        },
        refDate,
        selPeriods.filter((p) => periodOptions.includes(p))
      ),
    [
      snapshotsByPeriod,
      vokasi,
      selDirectorates,
      selDivisions,
      selDepts,
      selLaborTypes,
      selStatuses,
      refDate,
      selPeriods,
      periodOptions,
    ]
  );

  const [diffMonth, setDiffMonth] = useSessionState<string>("dash.movement.diffMonth", "");
  const availableMonths = useMemo(() => Array.from(snapshotsByPeriod.keys()).sort().reverse(), [snapshotsByPeriod]);
  const prevMonth = diffMonth ? previousPeriodWithData(diffMonth, snapshotsByPeriod) : null;
  // "Lihat Perubahan" follows both the shared org filter AND this section's
  // own Labor Type/Status selection — narrowing the chart above should
  // narrow the diff panel below it the same way.
  const diff = useMemo(() => {
    if (!diffMonth || !prevMonth) return null;
    const before = filterByLaborTypeStatus(snapshotsByPeriod.get(prevMonth)!, selLaborTypes, selStatuses);
    const after = filterByLaborTypeStatus(snapshotsByPeriod.get(diffMonth)!, selLaborTypes, selStatuses);
    return diffEmployees(before, after, reviews, demands, {
      directorates: selDirectorates,
      divisions: selDivisions,
      depts: selDepts,
    });
  }, [
    diffMonth,
    prevMonth,
    snapshotsByPeriod,
    reviews,
    demands,
    selDirectorates,
    selDivisions,
    selDepts,
    selLaborTypes,
    selStatuses,
  ]);

  return (
    <Card
      title="Manpower Movement"
      subtitle={`${selPeriods.length ? `${selPeriods.length} periode dipilih` : "Tahun fiskal berjalan (Apr–Mar)"} · bulan bertanda “–” belum ada snapshot ZPAR-nya.`}
      action={
        availableMonths.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <Shuffle size={14} className="text-slate-600 dark:text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Lihat Perubahan</span>
            <Select
              bare
              value={diffMonth}
              onChange={(e) => setDiffMonth(e.target.value)}
              className="!w-auto border-none !p-0 !py-0 text-sm font-semibold shadow-none focus:ring-0"
            >
              <option value="">- pilih bulan -</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
                </option>
              ))}
            </Select>
          </div>
        )
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <MultiSelect
          label="Periode"
          options={periodOptions}
          selected={selPeriods}
          onChange={setSelPeriods}
          placeholder="Tahun fiskal berjalan"
          labelOf={(m) => format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
        />
        <MultiSelect label="Labor Type" options={[...LABOR_TYPES]} selected={selLaborTypes} onChange={setSelLaborTypes} />
        <MultiSelect
          label="Status"
          options={MOVEMENT_STATUSES}
          selected={selStatuses}
          onChange={(v) => setSelStatuses(v as MovementStatus[])}
        />
      </div>
      <CompositionChart data={movementRows} heightClass="h-56" />
      {diffMonth && (
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          {!diff ? (
            <EmptyState text="Tidak ada data periode sebelumnya untuk dibandingkan." />
          ) : (
            <EmployeeDiffPanel diff={diff} fromMonth={prevMonth!} toMonth={diffMonth} />
          )}
        </div>
      )}
    </Card>
  );
}

const MUTATION_FIELD_LABELS: Record<string, string> = {
  division: "Divisi",
  dept: "Dept",
  section: "Section",
};

const EXIT_REASON_TONE: Record<string, BadgeTone> = {
  "Kontrak Ended/Terminate": "amber",
  Pensiun: "blue",
  Resign: "red",
  "Tidak Diketahui": "slate",
};

function EmployeeDiffPanel({ diff, fromMonth, toMonth }: { diff: EmployeeDiff; fromMonth: string; toMonth: string }) {
  const fmtMonth = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMM yyyy");
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Perubahan {fmtMonth(fromMonth)} → {fmtMonth(toMonth)}, berdasarkan noreg.
      </p>
      <div className="grid gap-4 lg:grid-cols-4">
        <DiffColumn
          icon={UserPlus}
          tone="emerald"
          title={`Baru (${diff.newHires.length})`}
          empty="Tidak ada penambahan."
          rows={diff.newHires.map((e) => ({
            key: e.employee.noreg,
            primary: `${e.employee.nama} (${e.employee.noreg})`,
            secondary: `${e.employee.division} · ${e.employee.dept}`,
            tag: e.overlapping ? "PKWT Overlapping" : undefined,
            tagTone: "violet" as BadgeTone,
          }))}
        />
        <DiffColumn
          icon={UserMinus}
          tone="red"
          title={`Keluar (${diff.exits.length})`}
          empty="Tidak ada pengurangan."
          rows={diff.exits.map((e) => ({
            key: e.employee.noreg,
            primary: `${e.employee.nama} (${e.employee.noreg})`,
            secondary: `${e.employee.division} · ${e.employee.dept}`,
            tag: e.reason,
            tagTone: EXIT_REASON_TONE[e.reason],
          }))}
        />
        <DiffColumn
          icon={Shuffle}
          tone="amber"
          title={`Mutasi (${diff.mutations.length})`}
          empty="Tidak ada mutasi."
          rows={diff.mutations.map((m) => ({
            key: m.noreg,
            primary: `${m.nama} (${m.noreg})`,
            secondary: m.changedFields
              .map((f) => `${MUTATION_FIELD_LABELS[f]}: ${m.before[f] || "-"} → ${m.after[f] || "-"}`)
              .join(" · "),
          }))}
        />
        <DiffColumn
          icon={TrendingUp}
          tone="violet"
          title={`Posisi (${diff.positionChanges.length})`}
          empty="Tidak ada perubahan posisi."
          rows={diff.positionChanges.map((p) => ({
            key: p.noreg,
            primary: `${p.nama} (${p.noreg})`,
            secondary: `${p.before || "-"} → ${p.after || "-"}`,
          }))}
        />
      </div>
    </div>
  );
}

function DiffColumn({
  icon: Icon,
  tone,
  title,
  empty,
  rows,
}: {
  icon: typeof UserPlus;
  tone: "emerald" | "red" | "amber" | "violet";
  title: string;
  empty: string;
  rows: { key: string; primary: string; secondary: string; tag?: string; tagTone?: BadgeTone }[];
}) {
  const toneClass = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    amber: "text-amber-600 dark:text-amber-400",
    violet: "text-violet-600 dark:text-violet-400",
  }[tone];
  return (
    <div>
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-semibold ${toneClass}`}>
        <Icon size={13} /> {title}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-600 dark:text-slate-400">{empty}</p>
      ) : (
        <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.key} className="rounded-lg border border-slate-100 px-2.5 py-1.5 text-xs dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-700 dark:text-slate-200">{r.primary}</span>
                {r.tag && <Badge tone={r.tagTone}>{r.tag}</Badge>}
              </div>
              <div className="text-slate-600 dark:text-slate-400">{r.secondary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
