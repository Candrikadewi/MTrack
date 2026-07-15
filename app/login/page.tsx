import { Sparkles } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-violet-400/20 blur-3xl" />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white/90 p-7 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/25">
            <Sparkles size={20} strokeWidth={2.25} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">M-TRACK</div>
            <div className="text-[11px] text-slate-400">Manpower Tracking</div>
          </div>
        </div>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-slate-400">
          Belum punya akun? Hubungi Admin untuk dibuatkan akses.
        </p>
      </div>
    </div>
  );
}
