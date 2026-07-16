"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const PANEL_WIDTH = 264;

/** Custom calendar dropdown replacing the native `<input type="date">` OS
 * chrome (calendar icon + dd/mm/yyyy text) that clashes with the rest of the
 * app's styled inputs. Same value contract as a native date input: ISO
 * "yyyy-MM-dd" string, "" when empty.
 *
 * The panel is portaled to document.body with fixed positioning computed
 * from the trigger's rect — this component is used inside table cells
 * (TableWrap has `overflow-x-auto`, which clips absolutely-positioned
 * descendants), so an in-place `absolute` dropdown would get cut off. */
export function DatePicker({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const selected = value ? parseISO(value) : undefined;
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
  }

  function toggleOpen() {
    if (open) {
      close();
      return;
    }
    setViewMonth(selected ?? new Date());
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPos({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8),
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        panelRef.current &&
        !panelRef.current.contains(target)
      ) {
        close();
      }
    }
    function onScroll() {
      close();
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(viewMonth)),
    end: endOfWeek(endOfMonth(viewMonth)),
  });

  function pick(day: Date) {
    onChange(format(day, "yyyy-MM-dd"));
    close();
  }

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        <span className={selected ? "" : "text-slate-400"}>
          {selected ? format(selected, "dd MMM yyyy") : "Pilih tanggal"}
        </span>
        <Calendar size={15} className="shrink-0 text-slate-400" />
      </button>
      {open &&
        !disabled &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            className="z-50 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {format(viewMonth, "MMMM yyyy")}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-slate-400">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {days.map((day) => {
                const inMonth = isSameMonth(day, viewMonth);
                const isSelected = selected && isSameDay(day, selected);
                const today = isToday(day);
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => pick(day)}
                    className={`rounded-lg py-1.5 text-xs transition-colors ${
                      isSelected
                        ? "bg-blue-600 font-semibold text-white"
                        : today
                          ? "font-semibold text-blue-600 ring-1 ring-inset ring-blue-200 dark:text-blue-400 dark:ring-blue-500/40"
                          : inMonth
                            ? "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                            : "text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-slate-800/50"
                    }`}
                  >
                    {format(day, "d")}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
              <button
                type="button"
                onClick={() => pick(new Date())}
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Hari ini
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    close();
                  }}
                  className="text-xs font-medium text-slate-400 transition-colors hover:text-red-600"
                >
                  Kosongkan
                </button>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
