"use client";
import { useMemo, useState } from "react";
import { format, addMonths } from "date-fns";
import { Card } from "@/components/ui/Card";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { DonutChart } from "@/components/ui/DonutChart";
import { Select } from "@/components/ui/Form";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { NoregInput, DateInput } from "@/components/enrollment/NoregInput";
import { useStoreList } from "@/lib/useStore";
import { demandStore, utilPoolStore } from "@/lib/repo";
import { fmtDate, sisaHari, demandVisibleDate, fulfillmentDeadline, supplyDemandStatus } from "@/lib/engine/compute";
import {
  demandGranularStatus,
  demandStatusLabel,
  demandTargetDate,
  deptsOfRows,
  divisionsOfRows,
  effectiveDemandCategory,
  filterByDivDept,
} from "@/lib/engine/enrollment";
import {
  assignPoolEntryToDemand,
  confirmDemandFulfillment,
  confirmShopReceipt,
  setDemandFulfillDate,
  setDemandNoReplace,
  setDemandReplacementByNoreg,
} from "@/lib/engine/actions";
import { useRole } from "@/lib/RoleContext";
import type { Demand, DemandCategory, ReplacementStatus, UtilPoolEntry } from "@/lib/types";

/** Sources where the replacement is an already-employed person being
 * redeployed (from the Supply Pool) rather than a fresh hire — picked via
 * dropdown instead of typed noreg. */
const POOL_SOURCES: ReplacementStatus[] = ["MP Excess", "MP Back Up"];

// "Vokasi New Hire" is intentionally on both lists (a PKWT vacancy can be
// backfilled from the Vokasi pipeline — see effectiveDemandCategory); there
// is no "PKWT New Hire" on the Vokasi tab, so sourcing only ever moves rows
// from the PKWT tab to the Vokasi tab, never the other way.
const PKWT_SOURCE_OPTIONS: ReplacementStatus[] = ["PKWT New Hire", "Vokasi New Hire", "MP Excess", "MP Back Up", "No Replace"];
const VOKASI_SOURCE_OPTIONS: ReplacementStatus[] = ["Vokasi New Hire", "MP Excess", "MP Back Up", "No Replace"];

function currentMonthKey(): string {
  return format(new Date(), "yyyy-MM");
}

function monthOptions(): string[] {
  const base = new Date(`${currentMonthKey()}-01T00:00:00`);
  return Array.from({ length: 13 }, (_, i) => format(addMonths(base, 6 - i), "yyyy-MM"));
}

/** Label for the confirm-fulfillment date, matching whichever Source this
 * candidate came through. */
function confirmLabel(d: Demand): string {
  if (d.replacement_status === "PKWT New Hire" || d.replacement_status === "Vokasi New Hire") return "Tgl Sign Kontrak";
  if (d.replacement_status === "MP Excess" || d.replacement_status === "MP Back Up") return "Tgl Assigned";
  return "Tgl Konfirmasi";
}

export function SupplyDemandPageClient() {
  const role = useRole();
  const [tab, setTab] = useState<DemandCategory>("PKWT");
  const [month, setMonth] = useState(currentMonthKey());
  const demands = useStoreList(demandStore);
  const poolEntries = useStoreList(utilPoolStore);

  const tabDemands = useMemo(() => demands.filter((d) => effectiveDemandCategory(d) === tab), [demands, tab]);
  const monthDemands = useMemo(
    () => tabDemands.filter((d) => demandVisibleDate(demandTargetDate(d)).slice(0, 7) === month),
    [tabDemands, month]
  );

  const [divs, setDivs] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const divOptions = divisionsOfRows(monthDemands);
  const deptOptions = deptsOfRows(monthDemands, divs);
  const filteredDemands = filterByDivDept(monthDemands, divs, depts)
    .slice()
    .sort((a, b) => demandTargetDate(a).localeCompare(demandTargetDate(b)));

  // Shop's replacement-edit RPC (set_demand_replacement) only authorizes
  // category = 'PKWT' — gate the client the same way so Shop never sees a
  // live editor on the Vokasi tab that the backend will just reject.
  const canEditReplacement = role === "admin" || (role === "shop" && tab === "PKWT");
  const canEditFulfillDate = role === "admin";

  const totalCount = monthDemands.length;
  const fulfilledCount = monthDemands.filter((d) => demandGranularStatus(d).startsWith("Fulfilled")).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Demand Pool</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Semua demand (PKWT Terminate/Vokasi Ended/GST/Unfit/Resign/Pension dari Enrollment, Project, Takt Up)
            dan candidate mapping, satu tempat untuk mengisi supply.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <span className="text-xs font-medium text-slate-500">Bulan</span>
          <Select
            bare
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setDivs([]);
              setDepts([]);
            }}
            className="!w-auto border-none !p-0 !py-0 text-sm font-semibold shadow-none focus:ring-0"
          >
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <FullWidthTabs
        tabs={[
          { key: "PKWT", label: "Kontrak (PKWT)" },
          { key: "Vokasi", label: "Vokasi" },
        ]}
        active={tab}
        onChange={(k) => {
          setTab(k as DemandCategory);
          setDivs([]);
          setDepts([]);
        }}
      />

      <Card
        title={`Demand Pool: ${format(new Date(`${month}-01T00:00:00`), "MMMM yyyy")}`}
        subtitle="Demand muncul H-4 minggu (hari kerja) dari Arrival to Shop. Bulan yang dipilih di atas adalah bulan demand ini actionable, bukan bulan orangnya hadir."
        action={
          <div className="flex gap-2">
            <MultiSelect
              options={divOptions}
              selected={divs}
              onChange={(v) => {
                setDivs(v);
                setDepts([]);
              }}
              placeholder="Semua Divisi"
              className="w-44"
            />
            <MultiSelect options={deptOptions} selected={depts} onChange={setDepts} placeholder="Semua Department" className="w-44" />
          </div>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="h-14 w-14 shrink-0">
            <DonutChart
              heightClass="h-full"
              data={[
                { key: "fulfilled", label: "Fulfilled", value: fulfilledCount, color: "#2563eb" },
                { key: "open", label: "Open", value: Math.max(totalCount - fulfilledCount, 0), color: "#94a3b8" },
              ]}
            />
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {fulfilledCount}/{totalCount}
            </span>{" "}
            MP fulfilled bulan ini.
          </div>
        </div>
        {filteredDemands.length === 0 ? (
          <EmptyState text="Tidak ada demand pada bulan/filter ini." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Replacement Need</Th>
                <Th>Outgoing</Th>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th>Arrival to Shop</Th>
                <Th>Due Date Sign Contract / Assigned</Th>
                <Th>Source</Th>
                <Th>Kandidat</Th>
                <Th>FS Status</Th>
                <Th>Planning Sign Contract / Assigned</Th>
                <Th>Shop Confirmation</Th>
                <Th>Demand Status</Th>
              </tr>
            </thead>
            <tbody>
              {filteredDemands.map((d) => (
                <SupplyDemandRow
                  key={d.id}
                  demand={d}
                  tab={tab}
                  canEditReplacement={canEditReplacement}
                  canEditFulfillDate={canEditFulfillDate}
                  poolEntries={poolEntries}
                />
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </div>
  );
}

function DeadlineCell({ deadline, fulfilled }: { deadline: string; fulfilled: boolean }) {
  if (!deadline) return <Td className="text-slate-400">-</Td>;
  const days = sisaHari(deadline);
  const cls = fulfilled ? "" : days < 0 ? "text-red-600 font-semibold" : days <= 5 ? "text-amber-600 font-semibold" : "";
  return <Td className={cls}>{fmtDate(deadline)}</Td>;
}

/** Shop Confirmation: checklist that marks a replacement as physically
 * received on the shop floor, separate from the HR/admin Sign Kontrak /
 * Assigned step. Checking it asks for the confirmation date; unchecking
 * clears it. */
function ShopConfirmCell({
  value,
  canEdit,
  onChange,
}: {
  value: string;
  canEdit: boolean;
  onChange: (date: string) => void;
}) {
  const checked = Boolean(value);
  if (!canEdit) {
    return checked ? <span>{fmtDate(value)}</span> : <span className="text-slate-400">Belum</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked ? format(new Date(), "yyyy-MM-dd") : "")}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
      />
      {checked && <DateInput value={value} onCommit={onChange} />}
    </div>
  );
}

function SupplyDemandRow({
  demand: d,
  tab,
  canEditReplacement,
  canEditFulfillDate,
  poolEntries,
}: {
  demand: Demand;
  tab: DemandCategory;
  canEditReplacement: boolean;
  canEditFulfillDate: boolean;
  poolEntries: UtilPoolEntry[];
}) {
  const isLabelRow = d.origin_type === "Project" || d.origin_type === "TaktUp";
  const target = demandTargetDate(d);
  const deadline = fulfillmentDeadline(target, d.fs_status);
  const isNoReplace = d.replacement_status === "No Replace";
  const hasCandidate = Boolean(d.replacement_noreg);
  const isPoolSource = POOL_SOURCES.includes(d.replacement_status);
  const status = supplyDemandStatus(target, deadline, d.shop_confirmed_date);
  // A demand shows under `tab` via effectiveDemandCategory, which can differ
  // from its origin category once Source = "Vokasi New Hire" moves a
  // PKWT-origin demand onto the Vokasi tab — trace that back for the reader.
  const crossSourced = d.category !== tab;
  const sourceOptions = tab === "PKWT" ? PKWT_SOURCE_OPTIONS : VOKASI_SOURCE_OPTIONS;

  return (
    <tr>
      <Td>
        {demandStatusLabel(d)}
        {crossSourced && (
          <span className="ml-1.5 text-[10px] font-normal text-slate-400">(dari Kontrak)</span>
        )}
      </Td>
      {isLabelRow ? (
        <Td className="italic text-slate-500">{d.outgoing_label}</Td>
      ) : (
        <Td>
          {d.outgoing_nama} <span className="text-slate-400">({d.outgoing_noreg})</span>
        </Td>
      )}
      <Td>{d.div}</Td>
      <Td>{d.dept}</Td>
      <Td>
        {canEditFulfillDate ? (
          <DateInput value={d.fulfill_date || target} onCommit={(v) => setDemandFulfillDate(d.id, v)} />
        ) : (
          fmtDate(target)
        )}
      </Td>
      <DeadlineCell deadline={deadline} fulfilled={status.startsWith("Fulfilled")} />

      <Td>
        {canEditReplacement ? (
          <Select
            value={d.replacement_status}
            onChange={(e) => {
              const replStatus = e.target.value as ReplacementStatus;
              if (replStatus === "No Replace") setDemandNoReplace(d.id, d.no_replace_reason);
              else setDemandReplacementByNoreg(d.id, d.replacement_noreg, replStatus);
            }}
            className="min-w-[140px]"
          >
            <option value="">- pilih -</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        ) : (
          d.replacement_status || "-"
        )}
      </Td>

      {isNoReplace ? (
        <>
          <Td className="text-slate-400">
            {canEditReplacement ? (
              <NoregInput
                value={d.no_replace_reason}
                placeholder="Alasan tidak direplace..."
                onCommit={(v) => setDemandNoReplace(d.id, v)}
              />
            ) : (
              d.no_replace_reason || "-"
            )}
          </Td>
          <Td className="text-slate-400">-</Td>
          <Td className="text-slate-400">-</Td>
          <Td className="text-slate-400">-</Td>
        </>
      ) : !d.replacement_status ? (
        <Td colSpan={4} className="text-slate-400">
          Pilih Source terlebih dahulu
        </Td>
      ) : (
        <>
          <Td className="whitespace-normal">
            {canEditReplacement ? (
              isPoolSource ? (
                <PoolReplacementSelect demand={d} poolEntries={poolEntries} />
              ) : (
                <NoregInput
                  value={d.replacement_noreg}
                  onCommit={(v) => setDemandReplacementByNoreg(d.id, v, d.replacement_status)}
                />
              )
            ) : (
              d.replacement_noreg || "-"
            )}
            {(d.replacement_nama || d.replacement_dept) && (
              <div className="mt-0.5 text-xs text-slate-400">
                {d.replacement_nama || "-"}
                {d.replacement_dept ? ` · ${d.replacement_dept}` : ""}
              </div>
            )}
          </Td>
          <Td>{d.fs_status ? <Badge tone={statusTone(d.fs_status)}>{d.fs_status}</Badge> : "-"}</Td>
          <Td>
            {!hasCandidate ? (
              <span className="text-slate-400">Isi kandidat dulu</span>
            ) : (
              <div>
                <div className="mb-0.5 text-[11px] text-slate-400">{confirmLabel(d)}</div>
                {canEditReplacement ? (
                  <DateInput value={d.fulfillment_confirmed_date} onCommit={(v) => confirmDemandFulfillment(d.id, v)} />
                ) : (
                  fmtDate(d.fulfillment_confirmed_date)
                )}
              </div>
            )}
          </Td>
          <Td>
            {!hasCandidate ? (
              <span className="text-slate-400">-</span>
            ) : !d.fulfillment_confirmed_date ? (
              <span className="text-slate-400">{confirmLabel(d)} dulu</span>
            ) : (
              <ShopConfirmCell
                value={d.shop_confirmed_date}
                canEdit={canEditReplacement}
                onChange={(v) => confirmShopReceipt(d.id, v)}
              />
            )}
          </Td>
        </>
      )}
      <Td>
        <Badge tone={statusTone(status)}>{status}</Badge>
      </Td>
    </tr>
  );
}

/** MP Excess/MP Back Up candidates come from the Supply Pool, not a typed
 * noreg — selecting one both maps and confirms the assignment in one step
 * (see assignPoolEntryToDemand). Same-department entries sort first;
 * cross-department entries are flagged in red so the FS-status implication
 * is visible before picking. Once a candidate is set, this cell collapses
 * back to plain noreg text (Nama/Dept already have their own columns) —
 * click it to reopen the picker. */
function PoolReplacementSelect({ demand, poolEntries }: { demand: Demand; poolEntries: UtilPoolEntry[] }) {
  const [editing, setEditing] = useState(false);
  const eligible = poolEntries
    .filter((e) => e.status === "Open" || e.noreg === demand.replacement_noreg)
    .sort((a, b) => (a.prev_dept === demand.dept ? 0 : 1) - (b.prev_dept === demand.dept ? 0 : 1));

  if (demand.replacement_noreg && !editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm text-slate-700 underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:text-slate-200"
      >
        {demand.replacement_noreg}
      </button>
    );
  }

  return (
    <Select
      value={demand.replacement_noreg}
      onChange={(e) => {
        const entry = eligible.find((p) => p.noreg === e.target.value);
        if (entry) assignPoolEntryToDemand(entry.id, demand.id);
        setEditing(false);
      }}
      onBlur={() => setEditing(false)}
      className="min-w-[160px]"
      autoFocus={editing}
    >
      <option value="">- pilih dari Supply Pool -</option>
      {eligible.map((e) => (
        <option
          key={e.id}
          value={e.noreg}
          style={e.prev_dept !== demand.dept ? { color: "#e11d48" } : undefined}
        >
          {e.nama} ({e.noreg}) — {e.prev_dept}
        </option>
      ))}
    </Select>
  );
}
