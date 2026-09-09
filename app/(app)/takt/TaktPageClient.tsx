"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, TableWrap, Td, Th } from "@/components/ui/Table";
import { AssignedList } from "@/components/ui/AssignedList";
import { TaktUpModal } from "@/components/takt/TaktUpModal";
import { TaktDownModal } from "@/components/takt/TaktDownModal";
import { useStoreList } from "@/lib/useStore";
import { demandStore, taktStore, utilPoolStore } from "@/lib/repo";
import { fmtDate } from "@/lib/engine/compute";
import { useRole } from "@/lib/RoleContext";
import type { Demand, MpStatusKategori, TaktCase, UtilPoolEntry } from "@/lib/types";

const MP_STATUS_TONE: Record<MpStatusKategori, "green" | "amber" | "violet"> = {
  Permanen: "green",
  Vokasi: "violet",
  PKWT: "amber",
  AKTI: "amber",
};

export function TaktPageClient() {
  const role = useRole();
  const [upOpen, setUpOpen] = useState(false);
  const [downOpen, setDownOpen] = useState(false);
  const [editingDown, setEditingDown] = useState<TaktCase | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const cases = useStoreList(taktStore).sort((a, b) => b.date.localeCompare(a.date));
  const demands = useStoreList(demandStore);
  const utilPool = useStoreList(utilPoolStore);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Takt Time Monitoring</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Takt Up membuat Demand di Enrollment. Takt Down langsung ke Supply Pool.
          </p>
        </div>
        {role === "admin" && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setDownOpen(true)}>
              + Takt Down
            </Button>
            <Button variant="primary" onClick={() => setUpOpen(true)}>
              + Takt Up
            </Button>
          </div>
        )}
      </div>

      {cases.length === 0 ? (
        <EmptyState text="Belum ada kasus Takt Time." />
      ) : (
        <div className="space-y-4">
          {cases.map((c) => (
            <TaktCaseCard
              key={c.id}
              takt={c}
              demands={demands}
              utilPool={utilPool}
              isExpanded={expanded.has(c.id)}
              onToggle={() => toggle(c.id)}
              canEdit={role === "admin" && c.category === "down"}
              onEdit={() => setEditingDown(c)}
            />
          ))}
        </div>
      )}

      {role === "admin" && (
        <>
          <TaktUpModal open={upOpen} onClose={() => setUpOpen(false)} />
          {downOpen && <TaktDownModal onClose={() => setDownOpen(false)} poolEntries={utilPool} />}
          {editingDown && (
            <TaktDownModal
              key={editingDown.id}
              onClose={() => setEditingDown(null)}
              editing={editingDown}
              poolEntries={utilPool}
            />
          )}
        </>
      )}
    </div>
  );
}

function TaktCaseCard({
  takt: c,
  demands,
  utilPool,
  isExpanded,
  onToggle,
  canEdit,
  onEdit,
}: {
  takt: TaktCase;
  demands: Demand[];
  utilPool: UtilPoolEntry[];
  isExpanded: boolean;
  onToggle: () => void;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const isUp = c.category === "up";
  const ok = isUp
    ? demands.filter((d) => c.demand_ids.includes(d.id)).every((d) => d.status === "Fulfilled")
    : utilPool.filter((u) => c.released_pool_ids.includes(u.id)).every((u) => u.status !== "Open");

  const header = (
    <div className="flex flex-1 items-center gap-2">
      {isUp ? (
        isExpanded ? (
          <ChevronDown size={16} className="shrink-0 text-slate-400" />
        ) : (
          <ChevronRight size={16} className="shrink-0 text-slate-400" />
        )
      ) : (
        <ChevronRight size={16} className="shrink-0 text-slate-400" />
      )}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">
            {isUp ? "Takt Up" : "Takt Down"} — {c.plant}
          </h3>
          <Badge tone={isUp ? "blue" : "violet"}>{fmtDate(c.date)}</Badge>
        </div>
        <div className="text-xs text-slate-500">
          {c.takt_before} menit → {c.takt_after} menit ·{" "}
          {isUp ? `${c.demand_ids.length} demand dibuat` : `${c.released_pool_ids.length} personil dilepas`}
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <div className="flex w-full flex-wrap items-center justify-between gap-3">
        {isUp ? (
          <button type="button" onClick={onToggle} className="flex flex-1 items-center text-left">
            {header}
          </button>
        ) : (
          <Link href={`/takt/${c.id}`} className="flex flex-1 items-center text-left">
            {header}
          </Link>
        )}
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Pencil size={12} /> Edit
            </button>
          )}
          {ok ? (
            <Badge tone="green">✅ {isUp ? "MP Terpenuhi" : "Semua Diutilisasi"}</Badge>
          ) : (
            <Badge tone="amber">⚠️ {isUp ? "Perlu Supply" : "Belum Diutilisasi"}</Badge>
          )}
        </div>
      </div>

      {isUp && isExpanded && (
        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          <TaktUpDetail takt={c} demands={demands} />
        </div>
      )}
    </Card>
  );
}

/** Mirrors Project Monitoring's row table — same composition-by-shop shape
 * (Divisi/Department/Status MP/Qty/Fulfilled), since a Takt Up's need_rows
 * are structurally identical to a Project's rows. */
function TaktUpDetail({ takt: c, demands }: { takt: TaktCase; demands: Demand[] }) {
  const rows = c.need_rows ?? [];
  if (rows.length === 0) return <p className="text-sm text-slate-400">Tidak ada rincian kebutuhan.</p>;
  return (
    <TableWrap>
      <thead>
        <tr>
          <Th>Divisi</Th>
          <Th>Department</Th>
          <Th>Status MP</Th>
          <Th>Qty</Th>
          <Th>Tanggal Pemenuhan</Th>
          <Th>Assigned</Th>
          <Th>Fulfilled</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const rowDemands = demands.filter(
            (d) => c.demand_ids.includes(d.id) && d.div === r.division && d.dept === r.dept && d.fulfill_date === r.fulfill_date
          );
          const fulfilledCount = rowDemands.filter((d) => d.status === "Fulfilled").length;
          return (
            <tr key={r.id}>
              <Td>{r.division}</Td>
              <Td>{r.dept}</Td>
              <Td>
                <Badge tone={MP_STATUS_TONE[r.status_mp]}>{r.status_mp}</Badge>
              </Td>
              <Td>{r.qty}</Td>
              <Td>{fmtDate(r.fulfill_date)}</Td>
              <Td className="whitespace-normal">
                <AssignedList demands={rowDemands} />
              </Td>
              <Td>
                {fulfilledCount}/{r.qty}
              </Td>
            </tr>
          );
        })}
      </tbody>
    </TableWrap>
  );
}
