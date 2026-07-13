"use client";
import { useState } from "react";
import { Input } from "@/components/ui/Form";

export function NoregInput({
  value,
  onCommit,
  placeholder = "Ketik noreg...",
}: {
  value: string;
  onCommit: (noreg: string) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Input
      value={draft}
      placeholder={placeholder}
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

export function DateInput({ value, onCommit }: { value: string; onCommit: (date: string) => void }) {
  return (
    <Input
      type="date"
      value={value || ""}
      className="min-w-[150px]"
      onChange={(e) => onCommit(e.target.value)}
    />
  );
}
