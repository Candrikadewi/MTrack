"use client";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/upload", label: "Upload Center" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/enrollment", label: "Enrollment Monitoring" },
  { href: "/projects", label: "Project Monitoring" },
  { href: "/takt", label: "Takt Time Monitoring" },
  { href: "/util-pool", label: "Utilization Pool" },
  { href: "/handover", label: "Handover Form" },
];

export function MobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-xs font-bold text-white">
        M
      </div>
      <select
        value={pathname ?? "/dashboard"}
        onChange={(e) => router.push(e.target.value)}
        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {NAV.map((item) => (
          <option key={item.href} value={item.href}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
