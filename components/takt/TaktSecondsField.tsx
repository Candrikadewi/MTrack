"use client";
import { Field, Input } from "@/components/ui/Form";
import { decimalMinutesToSeconds, formatMinutesSecondsClock, secondsToDecimalMinutes } from "@/lib/engine/compute";

/** Takt time input as shop floor actually thinks of it — detik — with a live
 * "mm.ss menit" clock-notation preview underneath. Still stores/emits
 * decimal minutes (TaktCase.takt_before/after's on-disk unit), so callers
 * don't change shape. */
export function TaktSecondsField({
  label,
  valueMinutes,
  onChange,
}: {
  label: string;
  valueMinutes: number;
  onChange: (minutes: number) => void;
}) {
  const seconds = decimalMinutesToSeconds(valueMinutes);
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        step={1}
        value={seconds || ""}
        onChange={(e) => onChange(secondsToDecimalMinutes(Number(e.target.value)))}
        placeholder="detik"
      />
      <span className="mt-1 block text-[11px] text-slate-400">= {formatMinutesSecondsClock(seconds)} menit</span>
    </Field>
  );
}
