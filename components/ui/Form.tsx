import type { ChangeEvent, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { DatePicker } from "./DatePicker";

const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

/** `type="date"` is routed through DatePicker (styled calendar dropdown)
 * instead of the native OS date-picker chrome. Same value/onChange contract
 * as a native date input (ISO "yyyy-MM-dd" string), so every existing call
 * site keeps working unchanged — the onChange handler only ever reads
 * `e.target.value`, which this synthesizes. */
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  if (props.type === "date") {
    const { value, onChange, disabled, className } = props;
    return (
      <DatePicker
        value={typeof value === "string" ? value : ""}
        onChange={(v) => onChange?.({ target: { value: v } } as ChangeEvent<HTMLInputElement>)}
        disabled={disabled}
        className={className}
      />
    );
  }
  return <input {...props} className={`${fieldClass} ${props.className ?? ""}`} />;
}

/** `bare` opts out of the custom chevron/box treatment for the rare inline,
 * borderless usage (e.g. the Dashboard's "Bulan" picker, already paired with
 * its own icon+label chrome) — everywhere else gets a chevron consistent
 * with MultiSelect instead of the native OS arrow. */
export function Select({
  bare,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { bare?: boolean }) {
  if (bare) {
    return <select {...props} className={`${fieldClass} ${className}`} />;
  }
  return (
    <div className="relative">
      <select {...props} className={`${fieldClass} appearance-none pr-9 ${className}`} />
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
      />
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}
