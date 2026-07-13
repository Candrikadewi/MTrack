"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/Form";
import { Button } from "@/components/ui/Button";
import { createManualDemand } from "@/lib/engine/actions";
import type { DemandCategory, DemandOriginType } from "@/lib/types";

const ORIGINS: Extract<DemandOriginType, "Resign" | "Pension" | "GST" | "Unfit" | "Manual">[] = [
  "Resign",
  "Pension",
  "GST",
  "Unfit",
  "Manual",
];

export function ManualDemandModal({
  open,
  onClose,
  defaultCategory,
}: {
  open: boolean;
  onClose: () => void;
  defaultCategory: DemandCategory;
}) {
  const [category, setCategory] = useState<DemandCategory>(defaultCategory);
  const [originType, setOriginType] = useState<(typeof ORIGINS)[number]>("Resign");
  const [outgoingNoreg, setOutgoingNoreg] = useState("");
  const [outgoingNama, setOutgoingNama] = useState("");
  const [div, setDiv] = useState("");
  const [dept, setDept] = useState("");
  const [fulfillDate, setFulfillDate] = useState("");

  function reset() {
    setOutgoingNoreg("");
    setOutgoingNama("");
    setDiv("");
    setDept("");
    setFulfillDate("");
  }

  function submit() {
    if (!outgoingNoreg || !dept) return;
    createManualDemand({ category, origin_type: originType, outgoing_noreg: outgoingNoreg, outgoing_nama: outgoingNama, div, dept, fulfill_date: fulfillDate });
    reset();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="+ Manual Demand">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kategori">
            <Select value={category} onChange={(e) => setCategory(e.target.value as DemandCategory)}>
              <option value="Vokasi">Vokasi</option>
              <option value="PKWT">Kontrak (PKWT)</option>
            </Select>
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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Noreg Outgoing (wajib)">
            <Input value={outgoingNoreg} onChange={(e) => setOutgoingNoreg(e.target.value)} />
          </Field>
          <Field label="Nama Outgoing">
            <Input value={outgoingNama} onChange={(e) => setOutgoingNama(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Divisi">
            <Input value={div} onChange={(e) => setDiv(e.target.value)} />
          </Field>
          <Field label="Department (wajib)">
            <Input value={dept} onChange={(e) => setDept(e.target.value)} />
          </Field>
        </div>
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
