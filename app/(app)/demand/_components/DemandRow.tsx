"use client";
// One row of the Detail dan Mapping Demand table: who is needed, status, source, candidate
// and the propose → verify → shop-confirm steps.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { Badge, statusTone } from "@/components/ui/Badge";
import { Td } from "@/components/ui/Table";
import { NoregInput, DateInput } from "@/components/enrollment/NoregInput";
import { Check, Circle, Pencil, Trash2 } from "lucide-react";
import { fmtDate, sisaHari, fulfillmentDeadline, supplyDemandStatus } from "@/lib/engine/compute";
import { demandStatusLabel, demandTargetDate, eligiblePoolEntriesForDemand } from "@/lib/engine/enrollment";
import {
  confirmDemandFulfillment,
  confirmShopReceipt,
  proposePoolCandidate,
  setDemandFulfillDate,
  setDemandNoReplace,
  setDemandReplacementByNoreg,
} from "@/lib/engine/actions";
import { pushToast } from "@/lib/toast";
import type { Demand, DemandCategory, ReplacementStatus, UtilPoolEntry } from "@/lib/types";
import { RehiredNoreg } from "./RehiredNoreg";
import { todayKey } from "@/lib/dates";
import { POOL_SOURCES, PKWT_SOURCE_OPTIONS, VOKASI_SOURCE_OPTIONS, whoOf } from "./demandHelpers";

function confirmStepLabel(d: Demand): string {
  if (d.replacement_status === "PKWT New Hire" || d.replacement_status === "Vokasi New Hire") return "Sign kontrak";
  if (d.replacement_status === "MP Excess" || d.replacement_status === "MP Back Up") return "Assigned";
  return "Verifikasi";
}

function DeadlineNote({ deadline, fulfilled }: { deadline: string; fulfilled: boolean }) {
  if (!deadline || fulfilled) return null;
  const days = sisaHari(deadline);
  const text = days < 0 ? `lewat ${-days} hari` : days === 0 ? "hari ini" : `${days} hari lagi`;
  const cls =
    days < 0
      ? "font-semibold text-red-700 dark:text-red-300"
      : days <= 5
        ? "font-semibold text-amber-700 dark:text-amber-300"
        : "text-slate-500 dark:text-slate-400";
  return (
    <div className={`mt-1 text-xs ${cls}`}>
      Batas sign/assign {fmtDate(deadline)} · {text}
    </div>
  );
}

type StepState = "done" | "current" | "todo";

function Step({ state, label, children }: { state: StepState; label: string; children?: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
          state === "done"
            ? "bg-emerald-600 text-white"
            : state === "current"
              ? "border-2 border-blue-600 dark:border-blue-400"
              : "border border-slate-300 dark:border-slate-600"
        }`}
      >
        {state === "done" ? (
          <Check size={11} strokeWidth={3} />
        ) : state === "current" ? (
          <Circle size={5} className="fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400" />
        ) : null}
      </span>
      <div className="min-w-0">
        <div
          className={`text-xs font-medium ${
            state === "todo" ? "text-slate-500 dark:text-slate-400" : "text-slate-800 dark:text-slate-100"
          }`}
        >
          {label}
          <span className="sr-only">
            {state === "done" ? " — selesai" : state === "current" ? " — langkah berikutnya" : " — belum"}
          </span>
        </div>
        {children}
      </div>
    </li>
  );
}

export function DemandRow({
  demand: d,
  tab,
  canEditReplacement,
  canEditFulfillDate,
  canVerify,
  poolEntries,
  onEdit,
  onDelete,
}: {
  demand: Demand;
  tab: DemandCategory;
  canEditReplacement: boolean;
  canEditFulfillDate: boolean;
  canVerify: boolean;
  poolEntries: UtilPoolEntry[];
  /** Manual demands that haven't started yet can be edited or deleted. */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const isLabelRow = d.origin_type === "Project" || d.origin_type === "TaktUp";
  const who = whoOf(d);
  const target = demandTargetDate(d);
  const deadline = fulfillmentDeadline(target, d.fs_status);
  const isNoReplace = d.replacement_status === "No Replace";
  const hasCandidate = Boolean(d.replacement_noreg);
  const verified = Boolean(d.fulfillment_confirmed_date);
  const isPoolSource = POOL_SOURCES.includes(d.replacement_status);
  const status = supplyDemandStatus(target, deadline, d.shop_confirmed_date);
  const recommendedEntries = !d.replacement_status ? eligiblePoolEntriesForDemand(poolEntries, d) : [];
  const isRecommended = recommendedEntries.length > 0;
  const crossSourced = d.category !== tab;
  const sourceOptions = tab === "PKWT" ? PKWT_SOURCE_OPTIONS : VOKASI_SOURCE_OPTIONS;
  const sourceLocked = verified && !isNoReplace;

  function verify() {
    confirmDemandFulfillment(d.id, todayKey());
    pushToast(`${who}: ${d.replacement_nama || d.replacement_noreg} diverifikasi.`, "success", {
      label: "Batalkan",
      onClick: () => confirmDemandFulfillment(d.id, ""),
    });
  }

  function unverify() {
    const previous = d.fulfillment_confirmed_date;
    confirmDemandFulfillment(d.id, "");
    pushToast(`Verifikasi ${who} dibatalkan.`, "success", {
      label: "Kembalikan",
      onClick: () => confirmDemandFulfillment(d.id, previous),
    });
  }

  return (
    <tr className="align-top">
      <Td freeze="only" className="min-w-[180px] max-w-[15rem] whitespace-normal">
        <div className="font-medium text-slate-800 dark:text-slate-100">
          {isLabelRow ? d.outgoing_label : d.outgoing_nama || d.outgoing_noreg}
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {isLabelRow ? demandStatusLabel(d) : `${d.outgoing_noreg} · ${demandStatusLabel(d)}`}
          {crossSourced && " (dari Kontrak)"}
        </div>
        {(onEdit || onDelete) && (
          <div className="mt-1.5 flex gap-3 text-xs font-medium">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1 text-blue-700 hover:underline dark:text-blue-400"
              >
                <Pencil size={11} aria-hidden /> Edit
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 text-red-700 hover:underline dark:text-red-400"
              >
                <Trash2 size={11} aria-hidden /> Hapus
              </button>
            )}
          </div>
        )}
      </Td>
      <Td>
        <Badge tone={statusTone(status)}>{status}</Badge>
        <DeadlineNote deadline={deadline} fulfilled={status.startsWith("Fulfilled") || verified} />
      </Td>
      <Td>
        <div>{d.dept}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{d.div}</div>
      </Td>
      <Td>
        {canEditFulfillDate ? (
          <DateInput
            value={d.fulfill_date || target}
            ariaLabel={`Tiba di shop, ${who}`}
            onCommit={(v) => setDemandFulfillDate(d.id, v)}
          />
        ) : (
          fmtDate(target)
        )}
      </Td>

      <Td>
        {canEditReplacement && !sourceLocked ? (
          <Select
            value={d.replacement_status}
            aria-label={`Source pengganti, ${who}`}
            onChange={(e) => {
              const replStatus = e.target.value as ReplacementStatus;
              if (replStatus === "No Replace") setDemandNoReplace(d.id, d.no_replace_reason);
              else setDemandReplacementByNoreg(d.id, d.replacement_noreg, replStatus);
            }}
            className={`min-w-[150px] ${isRecommended ? "border-blue-500 ring-1 ring-blue-400 dark:border-blue-500 dark:ring-blue-500/40" : ""}`}
          >
            <option value="">- pilih -</option>
            {sourceOptions.map((s) => (
              <option key={s} value={s}>
                {s}
                {isRecommended && s === "MP Excess" ? " (rekomendasi)" : ""}
              </option>
            ))}
          </Select>
        ) : (
          d.replacement_status || <span className="text-slate-500 dark:text-slate-400">-</span>
        )}
      </Td>

      <Td className="min-w-[220px] whitespace-normal">
        {isNoReplace ? (
          canEditReplacement ? (
            <NoregInput
              value={d.no_replace_reason}
              placeholder="Alasan tidak direplace..."
              ariaLabel={`Alasan tidak direplace, ${who}`}
              onCommit={(v) => setDemandNoReplace(d.id, v)}
            />
          ) : (
            <span className="text-slate-600 dark:text-slate-300">{d.no_replace_reason || "Tidak direplace"}</span>
          )
        ) : !d.replacement_status ? (
          isRecommended ? (
            <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5 dark:border-blue-500/30 dark:bg-blue-500/10">
              <p className="text-xs text-blue-800 dark:text-blue-200">
                <span className="font-semibold">Rekomendasi:</span> {recommendedEntries.length} MP Excess tersedia di Supply Pool.
              </p>
              {canEditReplacement && <PoolProposal demand={d} who={who} poolEntries={poolEntries} />}
            </div>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">Pilih Source dulu</span>
          )
        ) : verified ? (
          <CandidateSummary demand={d} />
        ) : isPoolSource ? (
          canEditReplacement ? (
            <PoolProposal demand={d} who={who} poolEntries={poolEntries} />
          ) : (
            <CandidateSummary demand={d} />
          )
        ) : canEditReplacement ? (
          <div className="space-y-1">
            <NoregInput
              value={d.replacement_noreg}
              ariaLabel={`Noreg kandidat, ${who}`}
              onCommit={(v) => setDemandReplacementByNoreg(d.id, v, d.replacement_status)}
            />
            {(d.replacement_nama || d.fs_status) && <CandidateMeta demand={d} />}
          </div>
        ) : (
          <CandidateSummary demand={d} />
        )}
      </Td>

      <Td className="min-w-[200px] whitespace-normal">
        {isNoReplace || !d.replacement_status ? (
          <span className="text-slate-500 dark:text-slate-400">-</span>
        ) : (
          <ol className="space-y-2" aria-label={`Progres mapping, ${who}`}>
            <Step state={hasCandidate ? "done" : "current"} label="Diusulkan">
              {!hasCandidate && <div className="text-xs text-slate-500 dark:text-slate-400">Isi kandidat dulu</div>}
            </Step>
            <Step state={verified ? "done" : hasCandidate ? "current" : "todo"} label={confirmStepLabel(d)}>
              {verified ? (
                canVerify ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <DateInput
                      value={d.fulfillment_confirmed_date}
                      ariaLabel={`Tanggal ${confirmStepLabel(d).toLowerCase()}, ${who}`}
                      onCommit={(v) => (v ? confirmDemandFulfillment(d.id, v) : unverify())}
                    />
                    <button
                      type="button"
                      onClick={unverify}
                      className="min-h-9 rounded-lg px-2 text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:text-white"
                    >
                      Batalkan
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 dark:text-slate-300">{fmtDate(d.fulfillment_confirmed_date)}</div>
                )
              ) : hasCandidate ? (
                canVerify ? (
                  <Button size="sm" variant="primary" className="mt-1" onClick={verify}>
                    Verifikasi
                  </Button>
                ) : (
                  <div className="text-xs text-amber-700 dark:text-amber-300">Menunggu verifikasi HR</div>
                )
              ) : null}
            </Step>
            <Step state={d.shop_confirmed_date ? "done" : verified ? "current" : "todo"} label="Diterima shop">
              {verified && (
                <ShopConfirmCell
                  value={d.shop_confirmed_date}
                  who={who}
                  canEdit={canEditReplacement}
                  onChange={(v) => confirmShopReceipt(d.id, v)}
                />
              )}
            </Step>
          </ol>
        )}
      </Td>
    </tr>
  );
}

function CandidateMeta({ demand: d }: { demand: Demand }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
      {d.replacement_nama && <span>{d.replacement_nama}</span>}
      {d.replacement_dept && <span>· {d.replacement_dept}</span>}
      {d.fs_status && <Badge tone={statusTone(d.fs_status)}>{d.fs_status}</Badge>}
    </div>
  );
}

function CandidateSummary({ demand: d }: { demand: Demand }) {
  if (!d.replacement_noreg) return <span className="text-slate-500 dark:text-slate-400">Belum ada kandidat</span>;
  return (
    <div>
      <div className="text-slate-800 dark:text-slate-100">
        {d.replacement_nama || d.replacement_noreg}{" "}
        <span className="text-xs text-slate-500 dark:text-slate-400">{d.replacement_noreg}</span>
      </div>
      <CandidateMeta demand={{ ...d, replacement_nama: "" }} />
      <RehiredNoreg demand={d} />
    </div>
  );
}

function ShopConfirmCell({
  value,
  who,
  canEdit,
  onChange,
}: {
  value: string;
  who: string;
  canEdit: boolean;
  onChange: (date: string) => void;
}) {
  const checked = Boolean(value);
  if (!canEdit) {
    return (
      <div className="text-xs text-slate-600 dark:text-slate-300">{checked ? fmtDate(value) : "Menunggu konfirmasi shop"}</div>
    );
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <label className="flex min-h-9 cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked ? todayKey() : "")}
          className="h-4 w-4 shrink-0 rounded border-slate-400 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-600 dark:bg-slate-900"
        />
        Sudah diterima
        <span className="sr-only">, {who}</span>
      </label>
      {checked && <DateInput value={value} ariaLabel={`Tanggal diterima shop, ${who}`} onCommit={onChange} />}
    </div>
  );
}

/** Step 1 of pool mapping. Picking a person only stages a draft; nothing is
 * saved until "Usulkan", which reserves them for this demand and leaves the
 * demand Open until HR/admin verifies. */
function PoolProposal({ demand, who, poolEntries }: { demand: Demand; who: string; poolEntries: UtilPoolEntry[] }) {
  const [changing, setChanging] = useState(false);
  const [draftId, setDraftId] = useState("");
  const eligible = eligiblePoolEntriesForDemand(poolEntries, demand);
  const current = demand.replacement_noreg ? eligible.find((e) => e.noreg === demand.replacement_noreg) : undefined;
  const choices = eligible.filter((e) => e.noreg !== demand.replacement_noreg);
  const draft = choices.find((e) => e.id === draftId);

  function propose() {
    if (!draft) return;
    const previousId = current?.id ?? null;
    proposePoolCandidate(draft.id, demand.id);
    pushToast(`${draft.nama} diusulkan untuk ${demand.dept}. Menunggu verifikasi HR.`, "success", {
      label: "Batalkan",
      onClick: () => proposePoolCandidate(previousId, demand.id),
    });
    setDraftId("");
    setChanging(false);
  }

  function withdraw() {
    if (!current) return;
    const previousId = current.id;
    proposePoolCandidate(null, demand.id);
    pushToast(`Usulan ${current.nama} ditarik, kembali ke Supply Pool.`, "success", {
      label: "Batalkan",
      onClick: () => proposePoolCandidate(previousId, demand.id),
    });
  }

  if (demand.replacement_noreg && !changing) {
    return (
      <div className="space-y-1.5">
        <CandidateSummary demand={demand} />
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setChanging(true)}
            className="min-h-8 rounded-lg px-2 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-500/10"
          >
            Ganti
          </button>
          {current && (
            <button
              type="button"
              onClick={withdraw}
              className="min-h-8 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Tarik usulan
            </button>
          )}
        </div>
      </div>
    );
  }

  if (choices.length === 0) {
    return <span className="text-xs text-slate-500 dark:text-slate-400">Tidak ada MP di Supply Pool yang bisa diusulkan.</span>;
  }

  return (
    <div className="space-y-1.5">
      <Select
        value={draftId}
        aria-label={`Pilih kandidat Supply Pool, ${who}`}
        onChange={(e) => setDraftId(e.target.value)}
        className="min-w-[200px]"
      >
        <option value="">- pilih dari Supply Pool -</option>
        {choices.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nama} ({e.noreg}) — {e.prev_dept}
            {e.prev_dept !== demand.dept ? " · beda dept" : ""}
          </option>
        ))}
      </Select>
      {draft && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          {draft.nama} → {demand.dept}
          {draft.prev_dept !== demand.dept && <> (pindah dari {draft.prev_dept})</>}
        </p>
      )}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="primary" disabled={!draft} onClick={propose}>
          Usulkan
        </Button>
        {changing && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setChanging(false);
              setDraftId("");
            }}
          >
            Batal
          </Button>
        )}
      </div>
    </div>
  );
}
