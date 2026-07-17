"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Upload,
  LayoutDashboard,
  ClipboardList,
  ArrowLeftRight,
  FolderKanban,
  Gauge,
  Users2,
  FileStack,
  LogOut,
  Sparkles,
} from "lucide-react";
import { logout } from "@/app/login/actions";
import { canAccessModule, type Role } from "@/lib/roles";
import { clearSessionState } from "@/lib/useSessionState";

const NAV_TOP = [
  { href: "/upload", label: "Upload Center", icon: Upload },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

/** These three menus are where demand actually gets entered/generated (PKWT
 * terminate reviews, project MP needs, takt-driven needs) — grouped visually
 * so it's clear they feed the Demand Pool page below, not the other way
 * around. */
const NAV_DEMAND_SOURCES = [
  { href: "/enrollment", label: "Enrollment Monitoring", icon: ClipboardList },
  { href: "/projects", label: "Project Monitoring", icon: FolderKanban },
  { href: "/takt", label: "Takt Time Monitoring", icon: Gauge },
];

const NAV_BOTTOM = [
  { href: "/supply-demand", label: "Demand Pool", icon: ArrowLeftRight },
  { href: "/util-pool", label: "Supply Pool", icon: Users2 },
  { href: "/handover", label: "Handover Form", icon: FileStack },
];

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", shop: "Shop", hr: "HR" };
const ROLE_TONE: Record<Role, string> = {
  admin: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  shop: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  hr: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
};

type NavItem = { href: string; label: string; icon: typeof Upload };

function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-indigo-500/30"
          : "text-slate-600 hover:translate-x-0.5 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800/80"
      }`}
    >
      <Icon
        size={17}
        strokeWidth={2}
        className={isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"}
      />
      {item.label}
    </Link>
  );
}

export function Sidebar({ role, email }: { role: Role; email: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");
  const navTop = NAV_TOP.filter((item) => canAccessModule(role, item.href));
  const navDemandSources = NAV_DEMAND_SOURCES.filter((item) => canAccessModule(role, item.href));
  const navBottom = NAV_BOTTOM.filter((item) => canAccessModule(role, item.href));

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80 md:flex">
      <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5 dark:border-slate-800">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-sm font-bold text-white shadow-md shadow-indigo-500/25">
          <Sparkles size={18} strokeWidth={2.25} />
        </div>
        <div>
          <div className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">M-TRACK</div>
          <div className="text-[11px] text-slate-400">Manpower Tracking</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navTop.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
        ))}

        {navDemandSources.length > 0 && (
          <div className="my-1.5 rounded-xl border border-dashed border-slate-200 p-1.5 dark:border-slate-700">
            <div className="px-2 pb-1.5 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Input &amp; Monitoring Demand
            </div>
            <div className="space-y-1">
              {navDemandSources.map((item) => (
                <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
              ))}
            </div>
          </div>
        )}

        {navBottom.map((item) => (
          <NavLink key={item.href} item={item} isActive={isActive(item.href)} />
        ))}
      </nav>
      <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="mb-3 flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ROLE_TONE[role]}`}>
            {ROLE_LABEL[role]}
          </span>
          <span className="truncate text-xs text-slate-500 dark:text-slate-400">{email}</span>
        </div>
        <form action={logout} onSubmit={clearSessionState}>
          <button
            type="submit"
            className="flex items-center gap-1.5 text-xs font-medium text-red-500 transition-colors hover:text-red-600"
          >
            <LogOut size={13} /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
