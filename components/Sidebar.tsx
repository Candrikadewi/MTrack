"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { canAccessModule, type Role } from "@/lib/roles";

const NAV = [
  { href: "/upload", label: "Upload Center", icon: "⬆" },
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/enrollment", label: "Enrollment Monitoring", icon: "☰" },
  { href: "/projects", label: "Project Monitoring", icon: "◧" },
  { href: "/takt", label: "Takt Time Monitoring", icon: "◷" },
  { href: "/util-pool", label: "Utilization Pool", icon: "◎" },
  { href: "/handover", label: "Handover Form", icon: "▤" },
];

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", shop: "Shop", hr: "HR" };

export function Sidebar({ role, email }: { role: Role; email: string }) {
  const pathname = usePathname();
  const nav = NAV.filter((item) => canAccessModule(role, item.href));

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:flex">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-5 dark:border-slate-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
          M
        </div>
        <div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">M-TRACK</div>
          <div className="text-[11px] text-slate-400">Manpower Tracking</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <span className="w-4 text-center text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="mb-2 truncate text-xs text-slate-500 dark:text-slate-400">
          {email} · <span className="font-semibold">{ROLE_LABEL[role]}</span>
        </div>
        <form action={logout}>
          <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
