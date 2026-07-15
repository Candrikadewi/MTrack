import type { ReactNode } from "react";

export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-max border-collapse text-sm [&_tbody_tr:hover]:bg-slate-50 dark:[&_tbody_tr:hover]:bg-slate-800/40 [&_tbody_tr:nth-child(even)]:bg-slate-50/60 dark:[&_tbody_tr:nth-child(even)]:bg-slate-800/20">
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={`whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`whitespace-nowrap border-b border-slate-100 px-4 py-2.5 text-slate-700 tabular-nums transition-colors dark:border-slate-800 dark:text-slate-300 ${className}`}
    >
      {children}
    </td>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 py-10 text-sm text-slate-400 dark:border-slate-700">
      {text}
    </div>
  );
}
