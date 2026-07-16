"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { useStoreList } from "@/lib/useStore";
import { handoverStore, zparStore } from "@/lib/repo";
import { deptsOf } from "@/lib/engine/dashboard";
import { buildHandoverForm, finalizeHandoverForm } from "@/lib/engine/handover";
import { fmtDate } from "@/lib/engine/compute";

export function HandoverClient() {
  const snapshots = useStoreList(zparStore);
  const forms = useStoreList(handoverStore).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const activeSnapshot = snapshots.find((s) => s.is_active);
  const depts = deptsOf(activeSnapshot?.employees ?? []);

  const [dept, setDept] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  function generate() {
    if (!dept || !period) return;
    buildHandoverForm(dept, period);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Handover Form</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Movement list (Vokasi ended + PKWT terminate) dari Demand yang sudah Fulfilled.
        </p>
      </div>

      <Card title="Generate Form">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Department">
            <Select value={dept} onChange={(e) => setDept(e.target.value)}>
              <option value="">Pilih department</option>
              {depts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Periode">
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button variant="primary" disabled={!dept} onClick={generate} className="w-full">
              Generate
            </Button>
          </div>
        </div>
      </Card>

      {forms.length === 0 ? (
        <EmptyState text="Belum ada Handover Form." />
      ) : (
        <div className="space-y-4">
          {forms.map((f) => (
            <Card
              key={f.id}
              title={`${f.dept}: ${f.period}`}
              action={
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(f.status)}>{f.status}</Badge>
                  {f.status === "Draft" && (
                    <Button size="sm" variant="primary" onClick={() => finalizeHandoverForm(f.id)}>
                      Finalize
                    </Button>
                  )}
                </div>
              }
            >
              {f.rows.length === 0 ? (
                <EmptyState text="Tidak ada movement pada dept/periode ini." />
              ) : (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>No</Th>
                      <Th>Tipe Movement</Th>
                      <Th>Outgoing</Th>
                      <Th>Incoming</Th>
                      <Th>Labor Type</Th>
                      <Th>Alasan</Th>
                      <Th>Tanggal</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {f.rows.map((r) => (
                      <tr key={r.id}>
                        <Td>{r.no}</Td>
                        <Td>{r.tipe_movement}</Td>
                        <Td>{r.outgoing}</Td>
                        <Td>{r.incoming || "-"}</Td>
                        <Td>{r.labor_type}</Td>
                        <Td>{r.alasan}</Td>
                        <Td>{fmtDate(r.tanggal)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
