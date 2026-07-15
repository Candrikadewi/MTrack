"use client";
import { useEffect, useRef, useState } from "react";
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

  const summary =
    selected.length === 0 ? placeholder : selected.length === 1 ? selected[0] : `${selected.length} dipilih`;

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <span className={selected.length === 0 ? "text-slate-400" : ""}>{summary}</span>
        <span className="flex items-center gap-1">
          {selected.length > 0 && (
            <X
              size={14}
              className="text-slate-400 hover:text-slate-600"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            />
          )}
          <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-56 w-full min-w-[180px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-slate-400">Tidak ada opsi</div>
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
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
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
