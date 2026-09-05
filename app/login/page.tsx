import { LoginForm } from "@/components/LoginForm";
import { BrandMark } from "@/components/ui/BrandMark";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/80 bg-white/90 p-7 shadow-xl shadow-slate-200/60 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none">
        <div className="mb-6 flex items-center gap-2.5">
          <BrandMark className="h-10 w-10" />
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">CIRCLE</div>
            <div className="text-[11px] leading-tight text-slate-600 dark:text-slate-400">
              Centralized Information Record &amp; Control for Labor Excellence
            </div>
          </div>
        </div>
        <LoginForm />
        <p className="mt-4 text-center text-xs text-slate-600 dark:text-slate-400">
          Belum punya akun? Hubungi Admin untuk dibuatkan akses.
        </p>
      </div>
    </div>
  );
}
