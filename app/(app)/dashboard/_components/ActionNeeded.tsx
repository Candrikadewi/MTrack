"use client";
// Action Needed: one row per stage and category (Isi Review PKWT, Mapping Candidate,
// Shop Confirmation) with its total and most urgent status; details live on the linked page.
import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Users2, HardHat } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  candidateBatchesNeedingAction,
  reviewBatchesNeedingAction,
  shopConfirmBatchesNeedingAction,
  type ActionBatch,
} from "@/lib/engine/dashboard";
import type { Role } from "@/lib/roles";
import type { Demand, PkwtReview } from "@/lib/types";

// 0. Action Needed — one row per (stage, category): Isi Review PKWT,
// Mapping Candidate PKWT/Vokasi, Shop Confirmation PKWT/Vokasi. Each row
// collapses every month-batch with a gap into a single total + worst-case
// status, so the panel stays a fixed 5 rows no matter how big a backlog
// gets — full month-by-month detail still lives on the linked source page.
interface ActionSectionSpec {
  key: string;
  icon: typeof ClipboardList;
  title: string;
  anchor: "due_date" | "arrival";
  batches: ActionBatch[];
}

/** Which Action Needed rows are each role's own job — admin sees the whole
 * pipeline as a monitoring overview; HR only fills PKWT reviews; Shop maps
 * replacements in Demand Pool and confirms them on the floor; Guest gets no
 * action rows at all (view-only). */
const ROLE_ACTION_KEYS: Record<Role, string[] | null> = {
  admin: null, // null = show every section
  hr: ["review"],
  shop: ["candidate-pkwt", "candidate-vokasi", "shop-pkwt", "shop-vokasi"],
  guest: [],
};

export function ActionNeededBlock({
  reviews,
  demands,
  role,
  hasActiveFilter,
}: {
  reviews: PkwtReview[];
  demands: Demand[];
  role: Role;
  hasActiveFilter: boolean;
}) {
  const reviewBatches = useMemo(() => reviewBatchesNeedingAction(reviews), [reviews]);
  const candidatePkwt = useMemo(() => candidateBatchesNeedingAction(demands, "PKWT"), [demands]);
  const candidateVokasi = useMemo(() => candidateBatchesNeedingAction(demands, "Vokasi"), [demands]);
  const shopPkwt = useMemo(() => shopConfirmBatchesNeedingAction(demands, "PKWT"), [demands]);
  const shopVokasi = useMemo(() => shopConfirmBatchesNeedingAction(demands, "Vokasi"), [demands]);

  const allSections: ActionSectionSpec[] = [
    { key: "review", icon: ClipboardList, title: "Isi Review PKWT", anchor: "due_date", batches: reviewBatches },
    { key: "candidate-pkwt", icon: Users2, title: "Mapping Candidate PKWT", anchor: "due_date", batches: candidatePkwt },
    { key: "candidate-vokasi", icon: Users2, title: "Mapping Candidate Vokasi", anchor: "due_date", batches: candidateVokasi },
    { key: "shop-pkwt", icon: HardHat, title: "Shop Confirmation PKWT", anchor: "arrival", batches: shopPkwt },
    { key: "shop-vokasi", icon: HardHat, title: "Shop Confirmation Vokasi", anchor: "arrival", batches: shopVokasi },
  ];
  const allowedKeys = ROLE_ACTION_KEYS[role];
  const sections = allowedKeys === null ? allSections : allSections.filter((s) => allowedKeys.includes(s.key));

  if (sections.length === 0) return null;

  // Urgency should be scannable without reading every row: most-overdue
  // first, and the routine "nothing to do here" rows collapsed out of the
  // way instead of taking up equal space next to what actually needs action.
  const active = sections.filter((s) => s.batches.length > 0);
  const safe = sections.filter((s) => s.batches.length === 0);
  const worstDaysOf = (s: ActionSectionSpec) => Math.min(...s.batches.map((b) => b.daysRemaining));
  const sortedActive = [...active].sort((a, b) => worstDaysOf(a) - worstDaysOf(b));

  return (
    <Card
      title="Action Needed"
      subtitle={
        hasActiveFilter
          ? "Progres tiap tahap review, candidate mapping, dan shop confirmation — seluruh organisasi, tidak mengikuti filter di atas."
          : "Progres tiap tahap review, candidate mapping, dan shop confirmation — real-time."
      }
    >
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {sortedActive.map((section) => (
          <ActionSummaryRow key={section.key} section={section} />
        ))}
        {safe.length > 0 && <SafeSectionsRow sections={safe} />}
      </div>
    </Card>
  );
}

function ActionSummaryRow({ section }: { section: ActionSectionSpec }) {
  const { icon: Icon, title, anchor, batches } = section;
  const totalGap = batches.reduce((sum, b) => sum + (b.total - b.done), 0);
  const worst = batches.reduce((a, b) => (b.daysRemaining < a.daysRemaining ? b : a));
  const overdue = worst.daysRemaining < 0;
  const days = Math.abs(worst.daysRemaining);
  const statusLabel =
    anchor === "arrival"
      ? overdue
        ? `H+${days} Arrival to Shop`
        : `H-${days} Arrival to Shop`
      : overdue
        ? `Overdue ${days}D`
        : `H-${days} due date`;

  return (
    <Link
      href={worst.href}
      className={`flex items-center gap-3 py-2.5 pl-2.5 pr-3 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 ${
        overdue ? "bg-red-50/70 dark:bg-red-500/[0.06]" : ""
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          overdue ? "bg-red-600 text-white shadow-sm shadow-red-500/30" : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
        }`}
      >
        <Icon size={14} strokeWidth={2.25} />
      </span>
      <span className="flex-1 text-slate-700 dark:text-slate-200">
        {title}{" "}
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          — {totalGap} MP tertunda · {batches.length} bulan
        </span>
      </span>
      {overdue ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">
          {statusLabel}
        </span>
      ) : (
        <Badge tone="amber">{statusLabel}</Badge>
      )}
      <ChevronRight size={15} className="shrink-0 text-slate-300 dark:text-slate-600" />
    </Link>
  );
}

/** Collapses every "nothing to do" section into one line so routine status
 * doesn't consume the same vertical space and visual weight as the rows that
 * actually need attention; expands on demand for anyone who wants the list. */
function SafeSectionsRow({ sections }: { sections: ActionSectionSpec[] }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 py-2.5 pl-2.5 pr-3 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
      >
        <CheckCircle2 size={15} className="shrink-0 text-emerald-500" />
        <span className="flex-1 text-slate-500 dark:text-slate-400">
          {sections.length} tahap lainnya aman
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-300 transition-transform dark:text-slate-600 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="divide-y divide-slate-50 pb-1 dark:divide-slate-900">
          {sections.map((s) => (
            <div key={s.key} className="flex items-center gap-3 py-2 pl-9 pr-3 text-sm">
              <s.icon size={14} className="shrink-0 text-slate-300 dark:text-slate-600" />
              <span className="flex-1 text-slate-500 dark:text-slate-400">{s.title}</span>
              <Badge tone="green">Aman</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
