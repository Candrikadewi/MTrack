"use client";
// PKWT and Vokasi Monitoring: per-month charts, review results, and how far each demand of
// the picked month has got (candidate, signed, received).
import Link from "next/link";
import { format } from "date-fns";
import { useSessionState } from "@/lib/useSessionState";
import { Card } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/StatTile";
import { MonthBarChart } from "@/components/ui/MonthBarChart";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import {
  demandMonthKey,
  effectiveDivisionScope,
  groupCountBy,
  monthBuckets,
  fulfillmentRows,
  isFulfillmentDone,
  reviewOutcome,
  type FulfillmentRow,
  type ReviewOutcome,
} from "@/lib/engine/dashboard";
import { effectiveDemandCategory, filterByDivDept, isDemandDue } from "@/lib/engine/enrollment";
import type { Demand, DemandCategory, EmployeeRecord, PkwtReview, VokasiRecord } from "@/lib/types";
import { currentMonthKey } from "@/lib/dates";
import { CompactDetailList } from "./CompactDetailList";

/** Both PKWT/Vokasi Monitoring cards fold their category's Demand-Supply
 * table in directly. It follows the month picked on the card's chart (a
 * Terminate / Vokasi Ended demand sits in its review / batch-end month,
 * the rest in their fulfilment month) and the page's org filter, and shows
 * how far each demand got — candidate, signed, received. Open demands
 * from earlier months are counted as carry-over so nothing drops off. */
function monthFulfillment(
  demands: Demand[],
  category: DemandCategory,
  month: string,
  divisionScope: string[],
  selDepts: string[]
): { rows: FulfillmentRow[]; carryOver: number } {
  const scoped = filterByDivDept(
    demands.filter((d) => effectiveDemandCategory(d) === category),
    divisionScope,
    selDepts
  );
  return {
    rows: fulfillmentRows(
      scoped.filter((d) => demandMonthKey(d) === month),
      category
    ),
    carryOver: scoped.filter((d) => demandMonthKey(d) < month && isDemandDue(d) && !isFulfillmentDone(d)).length,
  };
}

function monthLabel(month: string): string {
  return /^\d{4}-\d{2}$/.test(month) ? format(new Date(`${month}-01T00:00:00`), "MMM yyyy") : month;
}

export function PkwtReviewChartBlock({
  reviews,
  demands,
  employees,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  reviews: PkwtReview[];
  demands: Demand[];
  employees: EmployeeRecord[];
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const today = currentMonthKey();
  // Reviews/demands carry no `directorat` field — translate a Directorate
  // pick into its divisions first, same as the Total Manpower fix.
  const divisionScope = effectiveDivisionScope(employees, selDirectorates, selDivisions);
  const filteredReviews = filterByDivDept(reviews, divisionScope, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredReviews, (r) => r.tgl_review?.slice(0, 7), 3, 5, today);
  const [selected, setSelected] = useSessionState("dash.pkwtReview.month", today);
  const detailItems = byMonth.get(selected) ?? [];
  const outcome = reviewOutcome(detailItems);
  const byStatusKontrak = groupCountBy(detailItems, (r) => r.status_kontrak);
  const byLaborType = groupCountBy(detailItems, (r) => r.labor_type || "Other");
  const fulfillment = monthFulfillment(demands, "PKWT", selected, divisionScope, selDepts);

  return (
    <Card title="PKWT Monitoring" subtitle="Review kontrak per bulan, hasilnya, dan pemenuhan penggantinya">
      <div className="space-y-4">
        <MonthBarChart data={buckets} selectedMonth={selected} onSelect={setSelected} showValueLabels />
        <div>
          <div className="text-xs font-semibold text-slate-500">Detail: {monthLabel(selected)}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">orang review</span>
          </div>
          <ReviewOutcomePanel outcome={outcome} />
          <div className="mt-4 grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-slate-200 dark:sm:divide-slate-800">
            <div>
              <div className="text-xs font-medium text-slate-500">By Status Kontrak</div>
              <CompactDetailList items={byStatusKontrak} unit="review" />
            </div>
            <div className="sm:pl-4">
              <div className="text-xs font-medium text-slate-500">By Labor Type</div>
              <CompactDetailList items={byLaborType} unit="review" />
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold text-slate-500">Pemenuhan Demand PKWT — {monthLabel(selected)}</div>
          <FulfillmentTable rows={fulfillment.rows} carryOver={fulfillment.carryOver} />
        </div>
      </div>
    </Card>
  );
}

/** Continue / Terminate / belum diisi for the picked review month, as one
 * stacked bar with its legend — the review results HR fills in on the
 * Demand page. */
function ReviewOutcomePanel({ outcome }: { outcome: ReviewOutcome }) {
  if (outcome.total === 0) return null;
  const reviewed = outcome.continued + outcome.terminated;
  const parts = [
    { key: "continue", label: "Continue", value: outcome.continued, bar: "bg-emerald-500", dot: "bg-emerald-500" },
    { key: "terminate", label: "Terminate", value: outcome.terminated, bar: "bg-rose-500", dot: "bg-rose-500" },
    { key: "pending", label: "Belum diisi", value: outcome.pending, bar: "bg-slate-200 dark:bg-slate-700", dot: "bg-slate-300 dark:bg-slate-600" },
  ];
  return (
    <div className="mt-3 rounded-2xl border border-slate-100 p-3 dark:border-slate-800">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-xs font-medium text-slate-500">Hasil Review</div>
        <div className="text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {reviewed}/{outcome.total}
          </span>{" "}
          sudah direview
        </div>
      </div>
      <div
        className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        role="img"
        aria-label={`Continue ${outcome.continued}, Terminate ${outcome.terminated}, belum diisi ${outcome.pending}`}
      >
        {parts.map((p) =>
          p.value > 0 ? <div key={p.key} className={`h-full ${p.bar}`} style={{ width: `${(p.value / outcome.total) * 100}%` }} /> : null
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`size-2 rounded-full ${p.dot}`} />
            {p.label} <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function VokasiEndedChartBlock({
  vokasi,
  demands,
  employees,
  selDirectorates,
  selDivisions,
  selDepts,
}: {
  vokasi: VokasiRecord[];
  demands: Demand[];
  employees: EmployeeRecord[];
  selDirectorates: string[];
  selDivisions: string[];
  selDepts: string[];
}) {
  const today = currentMonthKey();
  const divisionScope = effectiveDivisionScope(employees, selDirectorates, selDivisions);
  const filteredVokasi = filterByDivDept(vokasi, divisionScope, selDepts);
  const { buckets, byMonth } = monthBuckets(filteredVokasi, (v) => v.tgl_ended?.slice(0, 7), 3, 5, today);
  const [selected, setSelected] = useSessionState("dash.vokasiEnded.month", today);
  const detailItems = byMonth.get(selected) ?? [];
  const fulfillment = monthFulfillment(demands, "Vokasi", selected, divisionScope, selDepts);
  const totals = sumFulfillment(fulfillment.rows);

  return (
    <Card title="Vokasi Monitoring" subtitle="Vokasi yang berakhir per bulan dan pemenuhan penggantinya">
      <div className="space-y-4">
        <MonthBarChart data={buckets} selectedMonth={selected} onSelect={setSelected} showValueLabels />
        <div>
          <div className="text-xs font-semibold text-slate-500">Detail: {monthLabel(selected)}</div>
          <div className="mt-1 text-2xl font-bold text-slate-800 dark:text-slate-100">
            {detailItems.length} <span className="text-sm font-normal text-slate-500">ended</span>
          </div>
          {totals.demand > 0 && (
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {totals.done}/{totals.demand}
              </span>{" "}
              demand sudah selesai
              {totals.noReplace > 0 ? ` (${totals.noReplace} No Replace)` : ""}
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="mb-2 text-xs font-semibold text-slate-500">Pemenuhan Demand Vokasi — {monthLabel(selected)}</div>
          <FulfillmentTable rows={fulfillment.rows} carryOver={fulfillment.carryOver} />
        </div>
      </div>
    </Card>
  );
}

function sumFulfillment(rows: FulfillmentRow[]) {
  const sum = (key: "demand" | "candidate" | "signed" | "received" | "noReplace" | "done") =>
    rows.reduce((n, r) => n + r[key], 0);
  return {
    demand: sum("demand"),
    candidate: sum("candidate"),
    signed: sum("signed"),
    received: sum("received"),
    noReplace: sum("noReplace"),
    done: sum("done"),
  };
}

function FulfillmentTable({ rows, carryOver }: { rows: FulfillmentRow[]; carryOver: number }) {
  const total = sumFulfillment(rows);
  const totalPercent = total.demand ? (total.done / total.demand) * 100 : 0;
  const carryOverNote =
    carryOver > 0 ? (
      <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
        + {carryOver} demand dari bulan sebelumnya belum selesai.{" "}
        <Link href="/demand" className="font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100">
          Buka Demand
        </Link>
      </p>
    ) : null;

  if (rows.length === 0) {
    return (
      <div>
        <EmptyState text="Belum ada demand di bulan ini." />
        {carryOverNote}
      </div>
    );
  }
  return (
    <div>
      <TableWrap>
        <thead>
          <tr>
            <Th>Replacement Need</Th>
            <Th>Demand</Th>
            <Th>Kandidat</Th>
            <Th>Sign / Verified</Th>
            <Th>Diterima Shop</Th>
            <Th>Progress</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.reason}>
              <Td>{r.reason}</Td>
              <Td className="tabular-nums">{r.demand}</Td>
              <Td className="tabular-nums">{r.candidate}</Td>
              <Td className="tabular-nums">{r.signed}</Td>
              <Td className="tabular-nums">
                {r.received}
                {r.noReplace > 0 && <span className="text-xs text-slate-500"> +{r.noReplace} No Replace</span>}
              </Td>
              <Td>
                <div className="w-28">
                  <ProgressBar percent={r.percent} />
                </div>
              </Td>
            </tr>
          ))}
          <tr className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
            <Td>Total</Td>
            <Td className="tabular-nums">{total.demand}</Td>
            <Td className="tabular-nums">{total.candidate}</Td>
            <Td className="tabular-nums">{total.signed}</Td>
            <Td className="tabular-nums">
              {total.received}
              {total.noReplace > 0 && <span className="text-xs font-normal text-slate-500"> +{total.noReplace} No Replace</span>}
            </Td>
            <Td>
              <div className="w-28">
                <ProgressBar percent={totalPercent} />
              </div>
            </Td>
          </tr>
        </tbody>
      </TableWrap>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Progress = diterima shop atau No Replace, dibagi total demand.
      </p>
      {carryOverNote}
    </div>
  );
}
