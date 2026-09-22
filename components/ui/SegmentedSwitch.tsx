"use client";

/** Compact two-option pill toggle — deliberately NOT full-width, so it reads
 * as a small filter-like control rather than a second primary tab bar. Use
 * this (not FullWidthTabs) whenever a switch sits alongside another
 * full-width tab row on the same section, so the two don't look like a
 * stutter of the same control (e.g. Kontrak/Vokasi next to Open/History). */
export function SegmentedSwitch<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`inline-flex shrink-0 rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            value === opt.value
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-indigo-500/30"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
