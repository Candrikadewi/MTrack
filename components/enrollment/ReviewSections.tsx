"use client";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Form";
import { Badge, statusTone } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { fmtDate, sisaHari } from "@/lib/engine/compute";
import { deptsOfRows, divisionsOfRows, filterByDivDept } from "@/lib/engine/enrollment";
import { setReviewResult } from "@/lib/engine/actions";
import type { PkwtReview, ReviewResult, VokasiRecord, VokasiStatusSaatIni } from "@/lib/types";

/** PKWT Continue/Terminate review table, filtered by period + div/dept. Div/
 * dept filter state is owned by the caller (not internal useSessionState)
 * so a sibling widget — e.g. Demand's filter-aware ratio widget — can react
 * to the same filter live instead of only syncing on remount. */
export function ReviewSection({
  period,
  reviews,
  canEditReview,
  divs,
  depts,
  onDivsChange,
  onDeptsChange,
}: {
  period: string;
  reviews: PkwtReview[];
  canEditReview: boolean;
  divs: string[];
  depts: string[];
  onDivsChange: (v: string[]) => void;
  onDeptsChange: (v: string[]) => void;
}) {
  const monthReviews = reviews.filter((r) => r.tgl_review.slice(0, 7) === period);
  const reviewDivOptions = divisionsOfRows(monthReviews);
  const reviewDeptOptions = deptsOfRows(monthReviews, divs);
  const filteredReviews = filterByDivDept(monthReviews, divs, depts);

  const terminateCount = filteredReviews.filter((r) => r.review_result === "Terminate").length;

  return (
    <Card
      title="Review PKWT"
      subtitle={`${filteredReviews.length} jatuh tempo review · ${terminateCount} terminate`}
      action={
        <div className="flex gap-2">
          <MultiSelect
            options={reviewDivOptions}
            selected={divs}
            onChange={(v) => {
              onDivsChange(v);
              onDeptsChange([]);
            }}
            placeholder="Semua Divisi"
            className="w-44"
          />
          <MultiSelect options={reviewDeptOptions} selected={depts} onChange={onDeptsChange} placeholder="Semua Department" className="w-44" />
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

export function VokasiEndedSection({
  period,
  vokasi,
  divs,
  depts,
  onDivsChange,
  onDeptsChange,
}: {
  period: string;
  vokasi: VokasiRecord[];
  divs: string[];
  depts: string[];
  onDivsChange: (v: string[]) => void;
  onDeptsChange: (v: string[]) => void;
}) {
  const monthVokasi = vokasi.filter((v) => v.tgl_ended?.slice(0, 7) === period);
  const divOptions = divisionsOfRows(monthVokasi.map((v) => ({ div: v.div })));
  const deptOptions = deptsOfRows(
    monthVokasi.map((v) => ({ div: v.div, dept: v.dept })),
    divs
  );
  const filtered = filterByDivDept(monthVokasi, divs, depts);

  return (
    <Card
      title="Vokasi Ended"
      subtitle={`${filtered.length} vokasi ended pada periode ini, perlu replace. Isi kandidat di menu Demand.`}
      action={
        <div className="flex gap-2">
          <MultiSelect
            options={divOptions}
            selected={divs}
            onChange={(v) => {
              onDivsChange(v);
              onDeptsChange([]);
            }}
            placeholder="Semua Divisi"
            className="w-44"
          />
          <MultiSelect options={deptOptions} selected={depts} onChange={onDeptsChange} placeholder="Semua Department" className="w-44" />
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
