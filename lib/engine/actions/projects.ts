// Projects: registration, editing, deleting, the seat chain of each MP, and releasing MP
// on each row's release date (holders with contract left go to the Supply Pool).
import { genId } from "../../storage";
import { demandStore, projectStore, utilPoolStore, valueMappingStore, vokasiStore, zparStore } from "../../repo";
import { computeReviewDate, sisaHari } from "../compute";
import { isPermanenForRatio, projectEndDate, rowReleaseDate } from "../../types";
import type { Demand, MpStatusKategori, Project, ProjectMpNeedRow } from "../../types";
import {
  mapMpStatusToDemandCategory,
  getActiveEmployeeByNoreg,
  getEmploymentStatus,
  estimateContractEnd,
} from "./people";
import { expandRowToDemands, createDemandsFromProjectRow, isEditableDemand } from "./demands";
import { setDemandNoReplace } from "./replacement";
import {
  linkedZparNoreg,
  findRehiredEmployee,
  linkRehiredAlumni,
  isRehiredAlumnus,
  holderNoregs,
  PENDING_NOREG_NOTE,
  syncRehiredPoolEntries,
} from "./rehire";
import { reconcileNeedRows } from "./needRows";
import type { NeedRowDraft } from "./needRows";
import { pushToUtilPool } from "./pool";

/** Registers a project from its name, Tanggal SOP and MP need-rows. Each
 * row carries its own release (date or No Release); end_date is derived. */
export function createProject(input: {
  name: string;
  sop_date: string;
  rows: Omit<ProjectMpNeedRow, "id">[];
}): Project {
  const project: Project = {
    id: genId("project"),
    name: input.name,
    start_date: input.sop_date,
    end_date: projectEndDate(input.rows, input.sop_date),
    status: "Ongoing",
    rows: input.rows.map((r) => ({ ...r, id: genId("row") })),
    demand_ids: [],
  };
  projectStore.insert(project);
  const rows = project.rows.map((row) => ({ ...row, demand_ids: createDemandsFromProjectRow(project, row).map((d) => d.id) }));
  return projectStore.update(project.id, { rows, demand_ids: rows.flatMap((r) => r.demand_ids) })!;
}

/** The need-row a project demand was expanded from. Rows record their own
 * demand ids; older projects predate that, so fall back to the first row
 * with the same division, department and MP status. */
export function projectRowOfDemand(project: Project, demand: Demand): ProjectMpNeedRow | undefined {
  return (
    project.rows.find((r) => r.demand_ids?.includes(demand.id)) ??
    project.rows.find(
      (r) => !r.demand_ids && r.division === demand.div && r.dept === demand.dept && mapMpStatusToDemandCategory(r.status_mp) === demand.category
    )
  );
}

/** Everyone who has held one project seat, in order: the person mapped to
 * the project demand, then whoever filled the replacement demand raised
 * when that person's contract ended (Vokasi Ended / PKWT Terminate), and so
 * on. Only verified (Fulfilled) fills count. */
export function projectSeatOccupants(seat: Demand, demands: Demand[] = demandStore.list()): Demand[] {
  const chain: Demand[] = [];
  const seen = new Set<string>();
  let current: Demand | undefined = seat;
  while (current && current.status === "Fulfilled" && current.replacement_noreg && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    const rehired = isRehiredAlumnus(current);
    const noregs = holderNoregs(current);
    // A rehired alumnus is replaced when their PKWT review ends in
    // Terminate — under the new noreg — never via their old Vokasi record.
    current = demands.find(
      (d) =>
        noregs.includes(d.outgoing_noreg) &&
        (d.origin_type === "PkwtTerminate" || (d.origin_type === "VokasiEnded" && !rehired))
    );
  }
  return chain;
}

const pendingProjectNoReplace = new Set<string>();

/** Keeps the replacement demands of project seats in line with each row's
 * release. When a Vokasi holding a seat ends before the row's release date,
 * their Vokasi Ended demand is the seat's next fill (labelled with the
 * project). When they end on/after it, the seat is not refilled, so that
 * demand becomes No Replace. No Release rows keep the regular cycle.
 * Idempotent; call when demands or projects may have changed. */
export function syncProjectSeatDemands(): void {
  const demands = demandStore.list();
  for (const project of projectStore.list()) {
    const label = `Project ${project.name}`;
    for (const seat of demands.filter((d) => d.origin_type === "Project" && d.origin_ref === project.id)) {
      const row = projectRowOfDemand(project, seat);
      const releaseDate = row ? rowReleaseDate(row, project) : null;
      for (const holder of projectSeatOccupants(seat, demands)) {
        if (isRehiredAlumnus(holder)) continue;
        const next = demands.find((d) => d.origin_type === "VokasiEnded" && d.outgoing_noreg === holder.replacement_noreg);
        if (!next) continue;
        if (!next.outgoing_label) demandStore.update(next.id, { outgoing_label: label });
        if (
          releaseDate &&
          next.tgl_ended_outgoing >= releaseDate &&
          next.replacement_status !== "No Replace" &&
          !next.fulfillment_confirmed_date &&
          !pendingProjectNoReplace.has(next.id)
        ) {
          pendingProjectNoReplace.add(next.id);
          setDemandNoReplace(next.id, `Rilis projek ${project.name} ${releaseDate}`);
        }
      }
    }
  }
}

export function projectSuppliedCount(project: Project): number {
  return demandStore.list().filter((d) => project.demand_ids.includes(d.id) && d.status === "Fulfilled").length;
}

/** Edit-after-registration: name/Tanggal SOP only — rows/demands are handled
 * by addProjectRow / increaseProjectRowQty / updateProjectRowRelease below,
 * which never delete or shrink existing demand records (only additive
 * changes are safe post-registration). */
export function updateProjectDetails(projectId: string, input: { name?: string; sop_date?: string }): void {
  const project = projectStore.get(projectId);
  if (!project) return;
  const sop = input.sop_date ?? project.start_date;
  projectStore.update(projectId, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    start_date: sop,
    end_date: projectEndDate(project.rows, sop),
  });
}

/** Changes a registered row's release (date or No Release) until it has
 * actually been released, then re-syncs its seats' replacement demands. */
export function updateProjectRowRelease(projectId: string, rowId: string, release: { release_date: string; no_release: boolean }): void {
  const project = projectStore.get(projectId);
  const row = project?.rows.find((r) => r.id === rowId);
  if (!project || !row || row.released) return;
  if (row.no_release === release.no_release && (row.release_date ?? "") === release.release_date) return;
  const rows = project.rows.map((r) => (r.id === rowId ? { ...r, ...release } : r));
  projectStore.update(projectId, { rows, end_date: projectEndDate(rows, project.start_date) });
  syncProjectSeatDemands();
}

/** Adds a brand-new MP need row to an already-registered project, expanding
 * it into demand records immediately (same as at creation time). Always
 * re-reads the project from the store so sequential calls in a loop don't
 * clobber each other's row/demand_ids updates. */
export function addProjectRow(projectId: string, row: Omit<ProjectMpNeedRow, "id">): void {
  const project = projectStore.get(projectId);
  if (!project) return;
  const newRow: ProjectMpNeedRow = { ...row, id: genId("row") };
  const created = createDemandsFromProjectRow({ ...project, rows: [...project.rows, newRow] }, newRow);
  const updatedRows = [...project.rows, { ...newRow, demand_ids: created.map((d) => d.id) }];
  projectStore.update(projectId, { rows: updatedRows, demand_ids: [...project.demand_ids, ...created.map((d) => d.id)] });
}

/** Increases an existing row's qty, creating demand records only for the
 * delta. Decreasing qty is intentionally not supported here — it would mean
 * silently deleting demand records that may already be Fulfilled. */
export function increaseProjectRowQty(projectId: string, rowId: string, newQty: number): void {
  const project = projectStore.get(projectId);
  if (!project) return;
  const row = project.rows.find((r) => r.id === rowId);
  if (!row || newQty <= row.qty) return;
  const delta = newQty - row.qty;
  const created = expandRowToDemands({ ...row, qty: delta }, "Project", project.id, project.name);
  const updatedRows = project.rows.map((r) =>
    r.id === rowId ? { ...r, qty: newQty, ...(r.demand_ids ? { demand_ids: [...r.demand_ids, ...created.map((d) => d.id)] } : {}) } : r
  );
  projectStore.update(projectId, { rows: updatedRows, demand_ids: [...project.demand_ids, ...created.map((d) => d.id)] });
}

/**
 * Deletes a project. Same safety invariant as deleteTaktDown: a demand it
 * generated that's still Open (no candidate mapped yet) is cleaned up with
 * it, but one already Fulfilled is left standing on its own — deleting the
 * project never erases a real, already-completed assignment.
 */
export function deleteProject(projectId: string): boolean {
  const project = projectStore.get(projectId);
  if (!project) return false;

  for (const demandId of project.demand_ids) {
    const demand = demandStore.get(demandId);
    if (demand && isEditableDemand(demand)) demandStore.remove(demandId);
  }
  projectStore.remove(projectId);
  return true;
}

/** Full edit of a registered project: name, Tanggal SOP and every need
 * row (see reconcileNeedRows). Returns an error message when refused. */
export function updateProject(projectId: string, input: { name: string; sop_date: string; rows: NeedRowDraft[] }): string | null {
  const project = projectStore.get(projectId);
  if (!project) return "Project tidak ditemukan.";
  const rowsIn = input.rows.map((r) => {
    const prev = r.id ? project.rows.find((p) => p.id === r.id) : undefined;
    return prev?.released ? { ...r, release_date: prev.release_date, no_release: prev.no_release, released: true } : r;
  });
  const result = reconcileNeedRows(project.rows, project.demand_ids, rowsIn, "Project", project.id, () => input.name);
  if (!result.ok) return result.error;
  projectStore.update(projectId, {
    name: input.name,
    start_date: input.sop_date,
    end_date: projectEndDate(result.rows, input.sop_date),
    rows: result.rows,
    demand_ids: result.demandIds,
  });
  syncProjectSeatDemands();
  return null;
}

/** §7 / §12 project releases, run when Demand/Supply/Project pages open
 * (admin). Each row is released on its own date: whoever holds each of its
 * seats at that point (the last verified fill in the seat's chain) goes to
 * Supply Pool as MP Excess if their contract is still running. No Release
 * rows are never released — they carry on as regular enrollment.
 *
 * A project counts as Finish (History) once nothing about it is pending in
 * either menu: every release date has passed, every demand it raised is
 * fulfilled (or No Replace), and everyone it released has been utilized. */
export function autoProjectFinishCheck(): void {
  // Releasing marks rows as done for good — never do it against a cache
  // that hasn't loaded yet (it would release nobody and still mark them).
  const needed = [projectStore, demandStore, utilPoolStore, vokasiStore, zparStore, valueMappingStore];
  needed.forEach((store) => store.init());
  if (!needed.every((store) => store.ready())) return;
  const demands = demandStore.list();
  linkRehiredAlumni();
  syncRehiredPoolEntries();
  for (const project of projectStore.list()) {
    const seats = demands.filter((d) => project.demand_ids.includes(d.id));

    let releasedAny = false;
    let pushedAny = false;
    const rows = project.rows.map((row) => {
      const releaseDate = rowReleaseDate(row, project);
      if (!releaseDate || sisaHari(releaseDate) > 0) return row;
      // Released rows are re-checked too (releasing is idempotent): a holder
      // missed earlier — e.g. a rehired alumnus looked up under their old
      // Vokasi noreg — still lands in the pool.
      for (const seat of seats.filter((d) => projectRowOfDemand(project, d)?.id === row.id)) {
        if (releaseSeatHolder(project, seat, demands, releaseDate)) pushedAny = true;
      }
      if (row.released) return row;
      releasedAny = true;
      return { ...row, released: true };
    });
    if (releasedAny) projectStore.update(project.id, { rows });

    const allReleased = rows.every((r) => r.released || !rowReleaseDate(r, project));
    const allFulfilled = seats.every((d) => d.status === "Fulfilled" || d.replacement_status === "No Replace");
    const allUtilized = !utilPoolStore
      .list()
      .some((e) => e.source === "ProjectFinish" && e.source_label === project.name && e.status === "Open");
    const status = allReleased && allFulfilled && allUtilized ? "Finish" : "Ongoing";
    if (project.status !== status && (status === "Finish" || pushedAny)) projectStore.update(project.id, { status });
  }
  syncProjectSeatDemands();
}

/** Puts a released seat's current holder into Supply Pool as MP Excess
 * while their contract still runs. A rehired alumnus is released as PKWT
 * under their new ZPAR noreg (their old Vokasi end date says nothing about
 * the PKWT contract); if the new ZPAR isn't in yet they go in under the old
 * noreg with a note, and syncRehiredPoolEntries swaps it later. Does
 * nothing if this project already released them. Returns whether an entry
 * was added. */
function releaseSeatHolder(project: Project, seat: Demand, demands: Demand[], releaseDate: string): boolean {
  const holder = projectSeatOccupants(seat, demands).at(-1);
  if (!holder) return false;
  const rehired = isRehiredAlumnus(holder);
  const emp = rehired ? findRehiredEmployee(holder.replacement_noreg) : getActiveEmployeeByNoreg(holder.replacement_noreg);
  const linked = rehired ? linkedZparNoreg(holder.replacement_noreg) : undefined;
  const noregs = [holder.replacement_noreg, ...(linked ? [linked] : []), ...(emp ? [emp.noreg] : [])];
  const alreadyIn = utilPoolStore
    .list()
    .some((e) => e.source === "ProjectFinish" && e.source_label === project.name && noregs.includes(e.noreg));
  if (alreadyIn) return false;

  let type: MpStatusKategori;
  let contractEnd: string | null;
  if (rehired) {
    type = emp && isPermanenForRatio(emp.status_kontrak) ? "Permanen" : "PKWT";
    contractEnd = emp && !isPermanenForRatio(emp.status_kontrak) ? computeReviewDate(emp.tgl_masuk, emp.status_kontrak) || null : null;
  } else {
    const employment = getEmploymentStatus(holder.replacement_noreg);
    type =
      employment === "Vokasi" || (!employment && (holder.replacement_status === "Vokasi New Hire" || holder.replacement_batch))
        ? "Vokasi"
        : employment === "Permanen"
          ? "Permanen"
          : "PKWT";
    contractEnd = estimateContractEnd(holder.replacement_noreg, type);
  }
  if (contractEnd !== null && sisaHari(contractEnd) < 0) return false;
  pushToUtilPool({
    noreg: emp?.noreg ?? holder.replacement_noreg,
    nama: emp?.nama ?? holder.replacement_nama,
    type,
    source: "ProjectFinish",
    source_label: project.name,
    prev_div: seat.div,
    prev_dept: seat.dept,
    contract_end: contractEnd,
    entered_pool_date: releaseDate,
    action_note: rehired && !emp ? PENDING_NOREG_NOTE : "",
  });
  return true;
}
