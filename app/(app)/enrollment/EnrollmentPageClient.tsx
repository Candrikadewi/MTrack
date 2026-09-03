"use client";
import { useState } from "react";
import { addMonths, format } from "date-fns";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Form";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { ManualDemandModal } from "@/components/enrollment/ManualDemandModal";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { useStoreList } from "@/lib/useStore";
import { pkwtReviewStore, vokasiStore } from "@/lib/repo";
import { fmtDate, sisaHari } from "@/lib/engine/compute";
import { deptsOfRows, divisionsOfRows, filterByDivDept } from "@/lib/engine/enrollment";
import { setReviewResult } from "@/lib/engine/actions";
import { useRole } from "@/lib/RoleContext";
import { useSessionState } from "@/lib/useSessionState";
import type { DemandCategory, PkwtReview, ReviewResult, VokasiRecord, VokasiStatusSaatIni } from "@/lib/types";

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** 13 months centered 6 back/6 ahead of today — same window as the rest of
 * the app's curated month Selects, replacing the bare browser month input. */
function monthOptions(): string[] {
  const base = new Date(`${currentMonthKey()}-01T00:00:00`);
  return Array.from({ length: 13 }, (_, i) => format(addMonths(base, 6 - i), "yyyy-MM"));
}

export function EnrollmentPageClient() {
  const role = useRole();
  const [tab, setTab] = useSessionState<DemandCategory>("enrollment.tab", "PKWT");
  const [period, setPeriod] = useSessionState<string>("enrollment.period", currentMonthKey());
  const [modalOpen, setModalOpen] = useState(false);

  const reviews = useStoreList(pkwtReviewStore);
  const vokasi = useStoreList(vokasiStore);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Enrollment Monitoring</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tempat identifikasi demand: review PKWT (Continue/Terminate), Vokasi yang perlu replace saat ended, dan
            demand tambahan (GST/Unfit/Resign/Pension). Candidate mapping & fulfillment ada di menu Demand Pool.
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40">
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {format(new Date(`${m}-01T00:00:00`), "MMM yyyy")}
              </option>
            ))}
          </Select>
          {role === "admin" && (
            <div>
              <Button variant="primary" onClick={() => setModalOpen(true)}>
                + Manual Demand
              </Button>
              <p className="mt-1 max-w-[160px] text-right text-[11px] leading-tight text-slate-400">
                Untuk demand tambahan: GST/Unfit/Resign/Pension
              </p>
            </div>
          )}
        </div>
      </div>

      <FullWidthTabs
        tabs={[
          { key: "PKWT", label: "Kontrak (PKWT)" },
          { key: "Vokasi", label: "Vokasi" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as DemandCategory)}
      />

      {tab === "PKWT" ? (
        <ReviewSection period={period} reviews={reviews} canEditReview={role === "admin" || role === "hr"} />
      ) : (
        <VokasiEndedSection period={period} vokasi={vokasi} />
      )}

      {role === "admin" && (
        <ManualDemandModal open={modalOpen} onClose={() => setModalOpen(false)} defaultCategory={tab} />
      )}
    </div>
  );
}

function ReviewSection({
  period,
  reviews,
  canEditReview,
}: {
  period: string;
  reviews: PkwtReview[];
  canEditReview: boolean;
}) {
  const monthReviews = reviews.filter((r) => r.tgl_review.slice(0, 7) === period);

  const [reviewDivs, setReviewDivs] = useSessionState<string[]>("enrollment.pkwt.divs", []);
  const [reviewDepts, setReviewDepts] = useSessionState<string[]>("enrollment.pkwt.depts", []);
  const reviewDivOptions = divisionsOfRows(monthReviews);
  const reviewDeptOptions = deptsOfRows(monthReviews, reviewDivs);
  const filteredReviews = filterByDivDept(monthReviews, reviewDivs, reviewDepts);

  const terminateCount = filteredReviews.filter((r) => r.review_result === "Terminate").length;

  return (
    <Card
      title="Review PKWT"
      subtitle={`${filteredReviews.length} jatuh tempo review · ${terminateCount} terminate`}
      action={
        <div className="flex gap-2">
          <MultiSelect
            options={reviewDivOptions}
            selected={reviewDivs}
            onChange={(v) => {
              setReviewDivs(v);
              setReviewDepts([]);
            }}
            placeholder="Semua Divisi"
            className="w-44"
          />
          <MultiSelect
            options={reviewDeptOptions}
            selected={reviewDepts}
            onChange={setReviewDepts}
            placeholder="Semua Department"
            className="w-44"
          />
        </div>
      }
    >
      {filteredReviews.length === 0 ? (
        <EmptyState text="Tidak ada PKWT jatuh tempo review pada periode/filter ini." />
      ) : (
        <TableWrap maxHeightClass="max-h-[600px]">
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
            {filteredReviews.map((r) => {
              const days = sisaHari(r.tgl_review);
              return (
                <tr key={r.id}>
                  <Td>{r.noreg}</Td>
                  <Td>{r.nama}</Td>
                  <Td>
                    <Badge tone={r.status_kontrak === "Permanen" ? "green" : "amber"}>{r.status_kontrak}</Badge>
                  </Td>
                  <Td>{r.div}</Td>
                  <Td>{r.dept}</Td>
                  <Td>{fmtDate(r.tgl_masuk)}</Td>
                  <Td>{fmtDate(r.tgl_review)}</Td>
                  <Td className={days < 0 ? "text-red-600" : days <= 14 ? "text-amber-600" : ""}>{days}</Td>
                  <Td>
                    {canEditReview ? (
                      <Select
                        value={r.review_result}
                        onChange={(e) => setReviewResult(r.id, e.target.value as ReviewResult)}
                        className="min-w-[130px]"
                      >
                        <option value="">-</option>
                        <option value="Continue">Continue</option>
                        <option value="Terminate">Terminate</option>
                      </Select>
                    ) : r.review_result ? (
                      <Badge tone={statusTone(r.review_result)}>{r.review_result}</Badge>
                    ) : (
                      "-"
                    )}
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

function vokasiEndedStatusTone(status: VokasiStatusSaatIni): "green" | "amber" | "blue" | "slate" {
  if (status === "Ended") return "green";
  if (status === "Need Replace") return "amber";
  if (status === "Overlapping") return "blue";
  return "slate";
}

function VokasiEndedSection({ period, vokasi }: { period: string; vokasi: VokasiRecord[] }) {
  const monthVokasi = vokasi.filter((v) => v.tgl_ended?.slice(0, 7) === period);

  const [divs, setDivs] = useSessionState<string[]>("enrollment.vokasi.divs", []);
  const [depts, setDepts] = useSessionState<string[]>("enrollment.vokasi.depts", []);
  const divOptions = divisionsOfRows(monthVokasi.map((v) => ({ div: v.div })));
  const deptOptions = deptsOfRows(
    monthVokasi.map((v) => ({ div: v.div, dept: v.dept })),
    divs
  );
  const filtered = filterByDivDept(monthVokasi, divs, depts);

  return (
    <Card
      title="Vokasi Ended"
      subtitle={`${filtered.length} vokasi ended pada periode ini, perlu replace. Isi kandidat di menu Demand Pool.`}
      action={
        <div className="flex gap-2">
          <MultiSelect
            options={divOptions}
            selected={divs}
            onChange={(v) => {
              setDivs(v);
              setDepts([]);
            }}
            placeholder="Semua Divisi"
            className="w-44"
          />
          <MultiSelect options={deptOptions} selected={depts} onChange={setDepts} placeholder="Semua Department" className="w-44" />
        </div>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState text="Tidak ada Vokasi ended pada periode/filter ini." />
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
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => {
              const days = sisaHari(v.tgl_ended);
              return (
                <tr key={v.id}>
                  <Td>{v.noreg}</Td>
                  <Td>{v.nama}</Td>
                  <Td>{v.div}</Td>
                  <Td>{v.dept}</Td>
                  <Td>{fmtDate(v.tgl_masuk)}</Td>
                  <Td>{fmtDate(v.tgl_ended)}</Td>
                  <Td className={days < 0 ? "text-red-600" : days <= 14 ? "text-amber-600" : ""}>{days}</Td>
                  <Td>
                    <Badge tone={vokasiEndedStatusTone(v.status_saat_ini)}>{v.status_saat_ini}</Badge>
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
