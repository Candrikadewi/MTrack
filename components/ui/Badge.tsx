import type { ReactNode } from "react";

type Tone = "slate" | "blue" | "green" | "amber" | "red" | "violet";

const toneClasses: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
  violet: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
};

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  switch (status) {
    case "Fulfilled":
    case "Fulfilled Ontime":
    case "Completed":
    case "Finish":
    case "Continue":
    case "No Need FS":
    case "Assigned":
      return "green";
    case "Open":
    case "Ongoing":
    case "Draft":
      return "blue";
    case "Need FS":
    case "Terminate":
    case "Released":
    case "DELAY":
      return "amber";
    case "Need Replace ASAP":
      return "red";
    case "Fulfilled but Delay":
      return "violet";
    default:
      return "slate";
  }
}
