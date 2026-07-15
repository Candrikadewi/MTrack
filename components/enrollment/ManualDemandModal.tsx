"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { createManualDemand, getActiveEmployeeByNoreg } from "@/lib/engine/actions";
import type { DemandCategory, DemandOriginType } from "@/lib/types";

const ORIGINS: Extract<DemandOriginType, "Resign" | "Pension" | "Unfit" | "GST" | "Others">[] = [
  "Resign",
  "Pension",
  "Unfit",
  "GST",
  "Others",
];

const CATEGORY_LABEL: Record<DemandCategory, string> = { Vokasi: "Vokasi", PKWT: "Kontrak (PKWT)" };

export function ManualDemandModal({
  open,
  onClose,
  defaultCategory,
}: {
  open: boolean;
  onClose: () => void;
  defaultCategory: DemandCategory;
}) {
  const [originType, setOriginType] = useState<(typeof ORIGINS)[number]>("Resign");
  const [othersReason, setOthersReason] = useState("");
  const [outgoingNoreg, setOutgoingNoreg] = useState("");
  const [outgoingNama, setOutgoingNama] = useState("");
  const [div, setDiv] = useState("");
  const [dept, setDept] = useState("");
  const [fulfillDate, setFulfillDate] = useState("");
  const [notFound, setNotFound] = useState(false);

  function reset() {
    setOutgoingNoreg("");
    setOutgoingNama("");
    setDiv("");
    setDept("");
    setFulfillDate("");
    setOthersReason("");
    setNotFound(false);
  }

  function lookupNoreg(noreg: string) {
    setOutgoingNoreg(noreg);
    if (!noreg) {
      setNotFound(false);
      return;
    }
    const emp = getActiveEmployeeByNoreg(noreg);
    if (emp) {
      setOutgoingNama(emp.nama);
      setDiv(emp.division);
      setDept(emp.dept);
      setNotFound(false);
    } else {
      setNotFound(true);
    }
  }

  function submit() {
    if (!outgoingNoreg || !dept) return;
    createManualDemand({
      category: defaultCategory,
      origin_type: originType,
      origin_label: originType === "Others" ? othersReason : undefined,
      outgoing_noreg: outgoingNoreg,
      outgoing_nama: outgoingNama,
      div,
      dept,
      fulfill_date: fulfillDate,
    });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="+ Manual Demand">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kategori">
            <div className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {CATEGORY_LABEL[defaultCategory]}
            </div>
          </Field>
          <Field label="Alasan (Origin)">
            <Select value={originType} onChange={(e) => setOriginType(e.target.value as (typeof ORIGINS)[number])}>
              {ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {originType === "Others" && (
          <Field label="Sebutkan Alasan">
            <Input value={othersReason} onChange={(e) => setOthersReason(e.target.value)} placeholder="Alasan lainnya..." />
          </Field>
        )}
        <Field label="Noreg Outgoing (wajib) — nama/divisi/department akan terisi otomatis">
          <Input value={outgoingNoreg} onChange={(e) => lookupNoreg(e.target.value)} />
          {notFound && (
            <p className="mt-1 text-xs text-amber-600">
              Noreg tidak ditemukan di data ZPAR aktif — isi nama/divisi/department manual di bawah.
            </p>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nama Outgoing">
            <Input value={outgoingNama} onChange={(e) => setOutgoingNama(e.target.value)} />
          </Field>
          <Field label="Divisi">
            <Input value={div} onChange={(e) => setDiv(e.target.value)} />
          </Field>
        </div>
        <Field label="Department (wajib)">
          <Input value={dept} onChange={(e) => setDept(e.target.value)} />
        </Field>
        <Field label="Tanggal Pemenuhan Target">
          <Input type="date" value={fulfillDate} onChange={(e) => setFulfillDate(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="primary" disabled={!outgoingNoreg || !dept} onClick={submit}>
            Simpan Demand
          </Button>
        </div>
      </div>
    </Modal>
  );
}
