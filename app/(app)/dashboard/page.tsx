"use client";
import { useMemo } from "react";
import Link from "next/link";
import { useSessionState } from "@/lib/useSessionState";
import { UserCheck, FileText, GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { FullWidthTabs } from "@/components/ui/Tabs";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { RatioWidget } from "@/components/ui/RatioWidget";
import { useStoreList, useStoreReady } from "@/lib/useStore";
import { demandStore, pkwtReviewStore, projectStore, taktStore, utilPoolStore, vokasiStore, zparStore } from "@/lib/repo";
import { effectiveDivisionScope, filterEmployees } from "@/lib/engine/dashboard";
import { computeVokasiStatus } from "@/lib/engine/compute";
import { isPermanenForRatio } from "@/lib/types";
import { useRole } from "@/lib/RoleContext";
import type { EmployeeRecord, ZparSnapshot } from "@/lib/types";
import { ActionNeededBlock } from "./_components/ActionNeeded";
import { AgeMovementBlock } from "./_components/AgeMovement";
import { LaborTypeMovementBlock } from "./_components/LaborTypeMovement";
import { ManpowerMovementBlock } from "./_components/ManpowerMovement";
import { PkwtReviewChartBlock, VokasiEndedChartBlock } from "./_components/Monitoring";
import { OrgCascadeFilter, StickyOrgFilterBar } from "./_components/OrgFilter";
import { ProjectSummaryBlock, TaktSummaryBlock } from "./_components/ProjectTaktSummary";
import { TotalManpowerCard } from "./_components/TotalManpowerCard";

export default function DashboardPage() {
  const role = useRole();
  const zparReady = useStoreReady(zparStore);
  const snapshots = useStoreList(zparStore);
  const vokasi = useStoreList(vokasiStore);
  const demands = useStoreList(demandStore);
  const reviews = useStoreList(pkwtReviewStore);
  const projects = useStoreList(projectStore);
  const taktCases = useStoreList(taktStore);
  const utilPool = useStoreList(utilPoolStore);

  const activeSnapshot = snapshots.find((s) => s.is_active);

  // Demography sections show the roster "as of hari aktif" — always the
  // Active ZPAR snapshot, full stop. There is no viewing-month picker here
  // anymore: browsing a *different* historical snapshot is Upload Center's
  // job (via "Use This Data"), not something Dashboard should also offer.
  const employees = useMemo(() => activeSnapshot?.employees ?? [], [activeSnapshot]);

  const fulfilledVokasiIds = useMemo(
    () => new Set(demands.filter((d) => d.category === "Vokasi" && d.status === "Fulfilled").map((d) => d.origin_ref)),
    [demands]
  );

  const snapshotsByPeriod = useMemo(() => {
    const latestByPeriod = new Map<string, ZparSnapshot>();
    for (const s of snapshots) {
      const existing = latestByPeriod.get(s.period);
      if (!existing || s.upload_date > existing.upload_date) latestByPeriod.set(s.period, s);
    }
    const map = new Map<string, EmployeeRecord[]>();
    for (const [p, s] of latestByPeriod) map.set(p, s.employees);
    return map;
  }, [snapshots]);

  // Single org filter for the whole page — every section below reads off
  // this instead of carrying its own separate Directorate/Division/Dept
  // MultiSelects.
  const [selDirectorates, setSelDirectorates] = useSessionState<string[]>("dash.org.directorates", []);
  const [selDivisions, setSelDivisions] = useSessionState<string[]>("dash.org.divisions", []);
  const [selDepts, setSelDepts] = useSessionState<string[]>("dash.org.depts", []);

  // Splits the long stack of sections below Action Needed into two switchable
  // groups so a visit doesn't mean scrolling past 8 cards to reach the one
  // you came for — "Demography" (who's on the roster) vs. "Monitoring"
  // (what needs tracking/action across reviews, demand-supply, project/takt).
  const [section, setSection] = useSessionState<"demography" | "monitoring">("dash.section", "demography");

  if (!zparReady) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ringkasan kondisi manpower, read-only, mengagregasi semua modul.
          </p>
        </div>
        <CardSkeleton lines={1} />
        <CardSkeleton lines={2} />
        <CardSkeleton lines={3} />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Belum ada snapshot ZPAR. Upload data di Upload Center terlebih dahulu.
          </p>
          <Link
            href="/upload"
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            Buka Upload Center
          </Link>
        </div>
      </div>
    );
  }

  const filteredEmployees = filterEmployees(employees, {
    directorates: selDirectorates,
    divisions: selDivisions,
    depts: selDepts,
  });
  // Vokasi has no `directorat` field — a Directorate-only selection must be
  // translated into its divisions first, or it silently fails to scope Vokasi
  // at all (the bug this replaces: Total Manpower's headline total mixed a
  // filtered ZPAR count with an unfiltered Vokasi count).
  const vokasiDivisionScope = effectiveDivisionScope(employees, selDirectorates, selDivisions);
  const filteredVokasi = vokasi.filter(
    (v) =>
      (vokasiDivisionScope.length === 0 || vokasiDivisionScope.includes(v.div)) &&
      (selDepts.length === 0 || selDepts.includes(v.dept))
  );

  const permanenCount = filteredEmployees.filter((e) => isPermanenForRatio(e.status_kontrak));
  const kontrakCount = filteredEmployees.filter((e) => !isPermanenForRatio(e.status_kontrak));
  const vokasiActive = filteredVokasi.filter((v) => computeVokasiStatus(v.tgl_ended, fulfilledVokasiIds.has(v.id)) !== "Ended");

  const genderCount = (arr: { gender: string }[]) => ({
    L: arr.filter((x) => x.gender === "L").length,
    P: arr.filter((x) => x.gender === "P").length,
  });

  const activeOrgFilterCount = selDirectorates.length + selDivisions.length + selDepts.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ringkasan kondisi manpower, read-only, mengagregasi semua modul.
        </p>
      </div>

      {/* Org filter — applies to every section below, and stays reachable
          while scrolling through them. */}
      <StickyOrgFilterBar
        activeCount={activeOrgFilterCount}
        onReset={() => {
          setSelDirectorates([]);
          setSelDivisions([]);
          setSelDepts([]);
        }}
      >
        <OrgCascadeFilter
          employees={employees}
          selDirectorates={selDirectorates}
          setSelDirectorates={setSelDirectorates}
          selDivisions={selDivisions}
          setSelDivisions={setSelDivisions}
          selDepts={selDepts}
          setSelDepts={setSelDepts}
        />
      </StickyOrgFilterBar>

      {/* 0. Action Needed */}
      <ActionNeededBlock reviews={reviews} demands={demands} role={role} hasActiveFilter={activeOrgFilterCount > 0} />

      <FullWidthTabs
        tabs={[
          { key: "demography", label: "Demography" },
          { key: "monitoring", label: "Monitoring" },
        ]}
        active={section}
        onChange={(k) => setSection(k as "demography" | "monitoring")}
      />

      {section === "demography" ? (
        <>
          {/* 1. Total Manpower & Status */}
          <Card
            title="Total Manpower & Status"
            subtitle={activeSnapshot ? `Data ZPAR periode ${activeSnapshot.period} (Active)` : undefined}
          >
            <TotalManpowerCard
              total={filteredEmployees.length + vokasiActive.length}
              gender={genderCount([...filteredEmployees, ...vokasiActive])}
              employees={filteredEmployees}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Permanen"
                value={permanenCount.length}
                sub={`L: ${genderCount(permanenCount).L} · P: ${genderCount(permanenCount).P}`}
                tone="emerald"
                icon={UserCheck}
              />
              <StatTile
                label="Kontrak"
                value={kontrakCount.length}
                sub={`L: ${genderCount(kontrakCount).L} · P: ${genderCount(kontrakCount).P}`}
                tone="amber"
                icon={FileText}
              />
              <StatTile
                label="Vokasi Aktif"
                value={vokasiActive.length}
                sub={`L: ${genderCount(vokasiActive).L} · P: ${genderCount(vokasiActive).P}`}
                tone="cyan"
                icon={GraduationCap}
              />
            </div>
          </Card>

          {/* 1b. Rasio Permanen:Kontrak:Vokasi — follows the same org filter as
              everything else on this page; unfiltered = whole plant. */}
          <RatioWidget
            counts={{ permanen: permanenCount.length, kontrak: kontrakCount.length, vokasi: vokasiActive.length }}
            scopeLabel={activeOrgFilterCount > 0 ? `${activeOrgFilterCount} filter aktif` : "Seluruh plant"}
          />

          {/* 2. Manpower Movement */}
          <ManpowerMovementBlock
            snapshotsByPeriod={snapshotsByPeriod}
            vokasi={vokasi}
            reviews={reviews}
            demands={demands}
            selDirectorates={selDirectorates}
            selDivisions={selDivisions}
            selDepts={selDepts}
          />

          {/* 3. Age Movement */}
          <AgeMovementBlock
            employees={employees}
            selDirectorates={selDirectorates}
            selDivisions={selDivisions}
            selDepts={selDepts}
          />

          {/* 4. Labor Type Movement */}
          <LaborTypeMovementBlock
            snapshotsByPeriod={snapshotsByPeriod}
            selDirectorates={selDirectorates}
            selDivisions={selDivisions}
            selDepts={selDepts}
          />
        </>
      ) : (
        <>
          {/* PKWT Monitoring / Vokasi Monitoring — each folds its own
              Demand-Supply table in, so it's not a separate card anymore. */}
          <div className="space-y-6">
            <PkwtReviewChartBlock
              reviews={reviews}
              demands={demands}
              employees={employees}
              selDirectorates={selDirectorates}
              selDivisions={selDivisions}
              selDepts={selDepts}
            />
            <VokasiEndedChartBlock
              vokasi={vokasi}
              demands={demands}
              employees={employees}
              selDirectorates={selDirectorates}
              selDivisions={selDivisions}
              selDepts={selDepts}
            />
          </div>

          {/* Project Monitoring / Takt Time Monitoring */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ProjectSummaryBlock projects={projects} demands={demands} />
            <TaktSummaryBlock taktCases={taktCases} demands={demands} utilPool={utilPool} />
          </div>
        </>
      )}
    </div>
  );
}
