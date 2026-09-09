"use client";
import { useId, useRef, type KeyboardEvent } from "react";

export function FullWidthTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  const groupId = useId();
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusAndSelect(key: string) {
    onChange(key);
    buttonRefs.current[key]?.focus();
  }

  function onKeyDown(e: KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + dir + tabs.length) % tabs.length];
    focusAndSelect(next.key);
  }

  return (
    <div role="tablist" className="flex w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
      {tabs.map((tab, i) => (
        <button
          key={tab.key}
          ref={(el) => {
            buttonRefs.current[tab.key] = el;
          }}
          role="tab"
          id={`${groupId}-tab-${tab.key}`}
          aria-selected={active === tab.key}
          tabIndex={active === tab.key ? 0 : -1}
          onKeyDown={(e) => onKeyDown(e, i)}
          onClick={() => onChange(tab.key)}
          className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 ${
            active === tab.key
              ? "bg-blue-600 text-white"
              : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
