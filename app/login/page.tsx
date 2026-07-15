import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
            M
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100">M-TRACK</div>
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
