"use client";
import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { navStackSnapshot, pageLabel, previousPath, subscribeNavStack } from "@/lib/navHistory";

/** "← Kembali ke …" to whichever page the person came from in this tab;
 * `fallback` when the page was opened directly (a link, a refresh in a
 * new tab). */
export function BackButton({ fallback }: { fallback: string }) {
  const pathname = usePathname() ?? "";
  const snapshot = useSyncExternalStore(subscribeNavStack, navStackSnapshot, () => "[]");
  const target = previousPath(snapshot, pathname) ?? fallback;
  return (
    <Link
      href={target}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <ArrowLeft size={15} aria-hidden /> Kembali ke {pageLabel(target)}
    </Link>
  );
}
