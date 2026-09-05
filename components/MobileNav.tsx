"use client";
import { usePathname, useRouter } from "next/navigation";
import { canAccessModule, type Role } from "@/lib/roles";
import { BrandMark } from "@/components/ui/BrandMark";

const NAV = [
  { href: "/upload", label: "Upload Center" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/enrollment", label: "Enrollment Monitoring" },
  { href: "/projects", label: "Project Monitoring" },
  { href: "/takt", label: "Takt Time Monitoring" },
  { href: "/supply-demand", label: "Demand Pool" },
  { href: "/util-pool", label: "Supply Pool" },
  { href: "/handover", label: "Handover Form" },
];

export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const router = useRouter();
  const nav = NAV.filter((item) => canAccessModule(role, item.href));
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
      <BrandMark className="h-7 w-7 rounded-md" />
      <select
        aria-label="Navigasi"
        value={pathname ?? "/dashboard"}
        onChange={(e) => router.push(e.target.value)}
        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        {nav.map((item) => (
          <option key={item.href} value={item.href}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
