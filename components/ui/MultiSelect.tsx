"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = "Semua",
  className = "",
}: {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const panelId = useId();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  function closeAndReturnFocus() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const summary =
    selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} dipilih`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <span id={labelId} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
          {label}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-labelledby={label ? `${labelId} ${panelId}-value` : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) closeAndReturnFocus();
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 ${
          selected.length > 0 ? "pr-8" : ""
        }`}
      >
        <span id={`${panelId}-value`} className={selected.length === 0 ? "text-slate-500" : ""}>
          {summary}
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {selected.length > 0 && (
        <button
          type="button"
          aria-label={label ? `Hapus filter ${label}` : "Hapus filter"}
          onClick={() => onChange([])}
          className="absolute right-8 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500 dark:text-slate-500 dark:hover:text-slate-300"
        >
          <X size={14} />
        </button>
      )}
      {open && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeAndReturnFocus();
          }}
          className="absolute z-30 mt-1 max-h-56 w-full min-w-[180px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-500">Tidak ada opsi</div>
          ) : (
            options.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-500"
                />
                {opt}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
