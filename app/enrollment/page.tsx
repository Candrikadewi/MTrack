"use client";
import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Form";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { StatTile, ProgressBar } from "@/components/ui/StatTile";
import { NoregInput, DateInput } from "@/components/enrollment/NoregInput";
import { ManualDemandModal } from "@/components/enrollment/ManualDemandModal";
import { useStoreList } from "@/lib/useStore";
import { demandStore, pkwtReviewStore } from "@/lib/repo";
import { fmtDate, sisaHari } from "@/lib/engine/compute";
import {
  computeEnrollmentSummary,
  demandStatusLabel,
  demandsForTabAndMonth,
  monthLabel,
} from "@/lib/engine/enrollment";
import { setDemandFulfillDate, setDemandReplacementByNoreg, setReviewResult } from "@/lib/engine/actions";
import type { Demand, DemandCategory, PkwtReview, ReviewResult } from "@/lib/types";

export default function EnrollmentPage() {
  const [tab, setTab] = useState<DemandCategory>("Vokasi");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [modalOpen, setModalOpen] = useState(false);

  const demands = useStoreList(demandStore);
  const reviews = useStoreList(pkwtReviewStore);

  const monthDemands = demandsForTabAndMonth(demands, tab, period);
  const summary = computeEnrollmentSummary(monthDemands);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Enrollment Monitoring</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Satu-satunya tempat input kandidat untuk mengisi demand apapun sumbernya.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            + Manual Demand
          </Button>
        </div>
      </div>

      <FullWidthTabs
        tabs={[
          { key: "Vokasi", label: "Vokasi" },
          { key: "PKWT", label: "Kontrak (PKWT)" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as DemandCategory)}
      />

      <Card title={`Summary — ${monthLabel(period)}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Total Perlu Diisi" value={summary.total} emphasize />
          <StatTile label="Sudah Fulfilled" value={summary.fulfilled} emphasize />
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">% Progress Fulfillment</div>
            <div className="mt-2">
              <ProgressBar percent={summary.percent} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-xs font-semibold text-slate-500">Breakdown per Tanggal</h4>
            {summary.byDate.length === 0 ? (
              <p className="text-sm text-slate-400">Tidak ada tanggal spesifik bulan ini.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {summary.byDate.map((row) => (
                  <li key={row.date} className="flex justify-between border-b border-slate-100 py-1 dark:border-slate-800">
                    <span className="text-slate-600 dark:text-slate-300">{fmtDate(row.date)}</span>
                    <span className="text-slate-800 dark:text-slate-100">
                      {row.total} orang, {row.fulfilled} sudah difulfill
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-2">
            <h4 className="mb-2 text-xs font-semibold text-slate-500">Demand Tambahan</h4>
            <div className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">Takt Time bulan {monthLabel(period)}</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                butuh {summary.takt.total} orang, {summary.takt.fulfilled} sudah difulfill
              </span>
            </div>
            <div className="flex justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
              <span className="text-slate-600 dark:text-slate-300">Project</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {summary.project.total} orang, {summary.project.fulfilled} sudah difulfill
              </span>
            </div>
          </div>
        </div>
      </Card>

      {tab === "Vokasi" ? (
        <VokasiDetail demands={monthDemands} />
      ) : (
        <KontrakDetail period={period} reviews={reviews} demands={monthDemands} />
      )}

      <ManualDemandModal open={modalOpen} onClose={() => setModalOpen(false)} defaultCategory={tab} />
    </div>
  );
}

function VokasiDetail({ demands }: { demands: Demand[] }) {
  return (
    <Card title="Detail — Vokasi">
      {demands.length === 0 ? (
        <EmptyState text="Tidak ada demand Vokasi pada periode ini." />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Noreg</Th>
              <Th>Nama Lengkap</Th>
              <Th>Divisi</Th>
              <Th>Department</Th>
              <Th>Tanggal Masuk</Th>
              <Th>Tanggal Ended</Th>
              <Th>Sisa Hari</Th>
              <Th>Noreg Pengganti</Th>
              <Th>Nama Pengganti</Th>
              <Th>Tanggal Masuk Pengganti</Th>
              <Th>Batch Pengganti</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {demands.map((d) => {
              const isLabelRow = d.origin_type === "Project" || d.origin_type === "TaktUp";
              const days = sisaHari(d.tgl_ended_outgoing || d.fulfill_date);
              return (
                <tr key={d.id}>
                  {isLabelRow ? (
                    <>
                      <Td className="text-slate-400">—</Td>
                      <Td className="italic text-slate-500">{d.outgoing_label}</Td>
                    </>
                  ) : (
                    <>
                      <Td>{d.outgoing_noreg}</Td>
                      <Td>{d.outgoing_nama}</Td>
                    </>
                  )}
                  <Td>{d.div}</Td>
                  <Td>{d.dept}</Td>
                  <Td>{isLabelRow ? "-" : fmtDate(d.tgl_masuk_outgoing)}</Td>
                  <Td>{isLabelRow ? "-" : fmtDate(d.tgl_ended_outgoing)}</Td>
                  <Td className={days < 0 ? "text-red-600" : days <= 14 ? "text-amber-600" : ""}>
                    {isNaN(days) ? "-" : days}
                  </Td>
                  <Td>
                    <NoregInput value={d.replacement_noreg} onCommit={(v) => setDemandReplacementByNoreg(d.id, v)} />
                  </Td>
                  <Td>{d.replacement_nama || "-"}</Td>
                  <Td>{d.replacement_tgl_masuk ? fmtDate(d.replacement_tgl_masuk) : "-"}</Td>
                  <Td>{d.replacement_batch || "-"}</Td>
                  <Td>
                    <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </Card>
  );
}

function KontrakDetail({
  period,
  reviews,
  demands,
}: {
  period: string;
  reviews: PkwtReview[];
  demands: Demand[];
}) {
  const monthReviews = reviews.filter((r) => r.tgl_review.slice(0, 7) === period);

  return (
    <>
      <Card title="Section 1 — Review">
        {monthReviews.length === 0 ? (
          <EmptyState text="Tidak ada PKWT jatuh tempo review pada periode ini." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Noreg</Th>
                <Th>Nama Lengkap</Th>
                <Th>Status</Th>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th>Tanggal Masuk</Th>
                <Th>Tanggal Review</Th>
                <Th>Sisa Hari</Th>
                <Th>Review Result</Th>
              </tr>
            </thead>
            <tbody>
              {monthReviews.map((r) => {
                const days = sisaHari(r.tgl_review);
                return (
                  <tr key={r.id}>
                    <Td>{r.noreg}</Td>
                    <Td>{r.nama}</Td>
                    <Td>{r.status_kontrak}</Td>
                    <Td>{r.div}</Td>
                    <Td>{r.dept}</Td>
                    <Td>{fmtDate(r.tgl_masuk)}</Td>
                    <Td>{fmtDate(r.tgl_review)}</Td>
                    <Td className={days < 0 ? "text-red-600" : days <= 14 ? "text-amber-600" : ""}>{days}</Td>
                    <Td>
                      <Select
                        value={r.review_result}
                        onChange={(e) => setReviewResult(r.id, e.target.value as ReviewResult)}
                        className="min-w-[130px]"
                      >
                        <option value="">-</option>
                        <option value="Continue">Continue</option>
                        <option value="Terminate">Terminate</option>
                      </Select>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <Card title="Section 2 — PKWT Demand">
        {demands.length === 0 ? (
          <EmptyState text="Tidak ada PKWT demand pada periode ini." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Noreg</Th>
                <Th>Nama Lengkap</Th>
                <Th>Status</Th>
                <Th>Divisi</Th>
                <Th>Department</Th>
                <Th>Noreg Pengganti</Th>
                <Th>Nama Pengganti</Th>
                <Th>Batch Pengganti</Th>
                <Th>Department Pengganti</Th>
                <Th>Status FS</Th>
                <Th>Tanggal Pemenuhan</Th>
              </tr>
            </thead>
            <tbody>
              {demands.map((d) => {
                const isLabelRow = d.origin_type === "Project" || d.origin_type === "TaktUp";
                return (
                  <tr key={d.id}>
                    {isLabelRow ? (
                      <>
                        <Td className="text-slate-400">—</Td>
                        <Td className="italic text-slate-500">{d.outgoing_label}</Td>
                      </>
                    ) : (
                      <>
                        <Td>{d.outgoing_noreg}</Td>
                        <Td>{d.outgoing_nama}</Td>
                      </>
                    )}
                    <Td>{demandStatusLabel(d)}</Td>
                    <Td>{d.div}</Td>
                    <Td>{d.dept}</Td>
                    <Td>
                      <NoregInput value={d.replacement_noreg} onCommit={(v) => setDemandReplacementByNoreg(d.id, v)} />
                    </Td>
                    <Td>{d.replacement_nama || "-"}</Td>
                    <Td>{d.replacement_batch || "-"}</Td>
                    <Td>{d.replacement_dept || "-"}</Td>
                    <Td>{d.fs_status ? <Badge tone={statusTone(d.fs_status)}>{d.fs_status}</Badge> : "-"}</Td>
                    <Td>
                      <DateInput value={d.fulfill_date} onCommit={(v) => setDemandFulfillDate(d.id, v)} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </>
  );
}
