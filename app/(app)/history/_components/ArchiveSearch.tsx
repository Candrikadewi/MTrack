"use client";
// History → Arsip: search every Demand, PKWT review, Vokasi record and
// Supply Pool entry in the database, including those older than the 12
// months the other pages keep loaded.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Form";
import { SegmentedSwitch } from "@/components/ui/SegmentedSwitch";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSessionState } from "@/lib/useSessionState";
import { ARCHIVE_TABLES, searchArchive, type ArchiveKind, type ArchivePage } from "@/lib/archive";

const KINDS = Object.keys(ARCHIVE_TABLES) as ArchiveKind[];

export function ArchiveSearch() {
  const [kind, setKind] = useSessionState<ArchiveKind>("history.archive.kind", "demands");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<{ key: string; page?: ArchivePage; error?: string } | null>(null);

  // Searching as you type, a moment after the last key.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(text);
      setPage(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [text]);

  const key = `${kind}|${query}|${page}`;
  useEffect(() => {
    let cancelled = false;
    searchArchive(kind, query, page).then(
      (res) => !cancelled && setResult({ key, page: res }),
      (err: unknown) => !cancelled && setResult({ key, error: err instanceof Error ? err.message : String(err) })
    );
    return () => {
      cancelled = true;
    };
  }, [kind, query, page, key]);

  const table = ARCHIVE_TABLES[kind];
  const current = result?.key === key ? result : null;

  return (
    <Card
      title="Arsip"
      subtitle="Cari di seluruh data yang pernah tercatat, termasuk yang lebih dari 12 bulan lalu (halaman lain hanya memuat data aktif). Terbaru di atas."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto">
          <SegmentedSwitch
            label="Jenis data"
            options={KINDS.map((k) => ({ value: k, label: ARCHIVE_TABLES[k].label }))}
            value={kind}
            onChange={(k) => {
              setKind(k);
              setPage(0);
            }}
          />
        </div>
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Cari noreg, nama, dept…"
          aria-label="Cari di arsip"
          className="w-64 max-w-full"
        />
      </div>

      {!current ? (
        <div className="space-y-2" aria-busy="true" aria-label="Memuat arsip">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : current.error ? (
        <p className="text-sm text-red-600 dark:text-red-400">Gagal memuat arsip: {current.error}</p>
      ) : current.page!.rows.length === 0 ? (
        <EmptyState text={query ? `Tidak ada ${table.label} yang cocok dengan "${query}".` : `Belum ada ${table.label}.`} />
      ) : (
        <>
          <TableWrap maxHeightClass="max-h-[28rem]">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <Th key={c}>{c}</Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {current.page!.rows.map((row) => (
                <tr key={row.id}>
                  {row.cells.map((cell, i) => (
                    <Td key={i}>{cell}</Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
            <span>Halaman {page + 1}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Sebelumnya
              </Button>
              <Button size="sm" variant="secondary" disabled={!current.page!.hasMore} onClick={() => setPage((p) => p + 1)}>
                Berikutnya
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
