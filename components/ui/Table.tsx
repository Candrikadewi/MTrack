import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

export function TableWrap({ children, maxHeightClass = "" }: { children: ReactNode; maxHeightClass?: string }) {
  const scrollable = Boolean(maxHeightClass);
  return (
    <div
      className={`overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 ${scrollable ? `${maxHeightClass} overflow-y-auto` : ""}`}
    >
      <table
        className={`data-table w-full min-w-max border-separate border-spacing-0 text-sm ${scrollable ? "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10" : ""}`}
      >
        {children}
      </table>
    </div>
  );
}

/** Frozen (sticky-left) columns so the person a row is about stays visible
 * while scrolling right to its action. "only" freezes a single identity
 * column; "noreg" + "nama" freeze a fixed-width Noreg column followed by
 * Nama. Only from `sm` up — on a phone a frozen column would eat most of
 * the scrollable width. The last frozen column carries the edge shadow. */
export type Freeze = "only" | "noreg" | "nama";

const FREEZE_EDGE = "sm:shadow-[inset_-1px_0_0_var(--table-divider),8px_0_8px_-8px_var(--freeze-shadow)]";
const FREEZE_BODY: Record<Freeze, string> = {
  only: `sm:sticky sm:left-0 sm:z-[1] bg-inherit ${FREEZE_EDGE}`,
  noreg: "sm:sticky sm:left-0 sm:z-[1] bg-inherit sm:w-32 sm:min-w-32 sm:max-w-32",
  nama: `sm:sticky sm:left-32 sm:z-[1] bg-inherit ${FREEZE_EDGE}`,
};
const FREEZE_HEAD: Record<Freeze, string> = {
  only: `sm:sticky sm:left-0 sm:z-20! ${FREEZE_EDGE}`,
  noreg: "sm:sticky sm:left-0 sm:z-20! sm:w-32 sm:min-w-32 sm:max-w-32",
  nama: `sm:sticky sm:left-32 sm:z-20! ${FREEZE_EDGE}`,
};

export function Th({ children, className = "", freeze }: { children?: ReactNode; className?: string; freeze?: Freeze }) {
  return (
    <th
      scope="col"
      className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 ${freeze ? FREEZE_HEAD[freeze] : ""} ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
  freeze,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
  freeze?: Freeze;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`whitespace-nowrap border-b border-slate-100 px-4 py-2.5 text-slate-700 tabular-nums dark:border-slate-800 dark:text-slate-300 ${freeze ? FREEZE_BODY[freeze] : ""} ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 py-10 text-sm text-slate-600 dark:text-slate-400 dark:border-slate-700">
      {text}
    </div>
  );
}

/** Empty state for a table that has real data behind it but the current
 * filter combination happens to match nothing — distinct from EmptyState
 * (which covers "there's genuinely no data yet") so the copy can nudge
 * toward the actual fix (loosen the filter) instead of implying the page
 * itself is empty. */
export function FilteredEmptyState({
  text = "Belum ada yang cocok. Coba longgarkan filter di atas.",
  onReset,
}: {
  text?: string;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-slate-300 py-10 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
      <span>{text}</span>
      <Button variant="secondary" size="sm" onClick={onReset}>
        Reset Filter
      </Button>
    </div>
  );
}
