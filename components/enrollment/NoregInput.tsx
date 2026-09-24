"use client";
import { useState } from "react";
import { Input } from "@/components/ui/Form";

export function NoregInput({
  value,
  onCommit,
  placeholder = "Ketik noreg...",
  ariaLabel,
}: {
  value: string;
  onCommit: (noreg: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Input
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className="min-w-[120px]"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function DateInput({
  value,
  onCommit,
  ariaLabel,
}: {
  value: string;
  onCommit: (date: string) => void;
  ariaLabel?: string;
}) {
  return (
    <Input
      type="date"
      value={value || ""}
      aria-label={ariaLabel}
      className="min-w-[150px]"
      onChange={(e) => onCommit(e.target.value)}
    />
  );
}
