import "server-only";
// The engine's recurring work, run on the server once a day (see
// app/api/jobs/daily/route.ts) instead of only when an admin happens to
// open a page. It runs the very same functions the pages run — each one is
// idempotent, and migration_16 stops the database from taking a duplicate —
// so a page doing the same work at the same moment is harmless.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  autoProjectFinishCheck,
  ensureVokasiEndedDemands,
  generatePkwtReviews,
  pruneStaleVokasiDemands,
  repairMissingPlanDemands,
  syncProjectSeatDemands,
} from "../engine/actions";
import {
  demandStore,
  pkwtReviewStore,
  projectStore,
  taktStore,
  utilPoolStore,
  valueMappingStore,
  vokasiStore,
  zparStore,
} from "../repo";
import { onWriteFailure, setDataClient, settleWrites, trackInFlight } from "../storage";

const ERROR_LOG_DAYS = 90;

const JOB_STORES = [
  zparStore,
  vokasiStore,
  pkwtReviewStore,
  demandStore,
  projectStore,
  taktStore,
  utilPoolStore,
  valueMappingStore,
];

export interface DailyJobReport {
  startedAt: string;
  finishedAt: string;
  pkwtReviewsCreated: number;
  vokasiEndedDemandsCreated: number;
  staleVokasiDemandsRemoved: number;
  missingPlanDemandsRepaired: number;
  supplyPoolEntriesAdded: number;
  projectsFinished: number;
  /** Writes the database refused, as "table: message". */
  failures: string[];
}

/** The engine calls rpc(...).then(...) without keeping the promise; this
 * client keeps each one so the job can wait for it before reporting. */
function trackingClient(client: SupabaseClient): SupabaseClient {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "rpc") {
        return (...args: Parameters<SupabaseClient["rpc"]>) => trackInFlight(Promise.resolve(target.rpc(...args)));
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** Runs every recurring job against the database `client` connects to (a
 * service-role client: it acts as admin, see migration_18). */
let running = false;

export async function runDailyJobs(client: SupabaseClient): Promise<DailyJobReport> {
  // The stores are shared by this server process: one run at a time.
  if (running) throw new Error("Daily jobs are already running");
  running = true;
  const startedAt = new Date().toISOString();
  const failures: string[] = [];
  const tracked = trackingClient(client);
  setDataClient(() => tracked as never);
  onWriteFailure((table, message) => failures.push(`${table}: ${message}`));
  try {
    await Promise.all(JOB_STORES.map((store) => store.load()));
    const poolBefore = utilPoolStore.list().length;
    const finishedBefore = projectStore.list().filter((p) => p.status === "Finish").length;

    const reviews = await generatePkwtReviews();
    const staleVokasiDemandsRemoved = pruneStaleVokasiDemands();
    const vokasiEndedDemandsCreated = await ensureVokasiEndedDemands();
    const missingPlanDemandsRepaired = await repairMissingPlanDemands();
    autoProjectFinishCheck();
    syncProjectSeatDemands();
    // The error log keeps 90 days.
    const cutoff = new Date(Date.now() - ERROR_LOG_DAYS * 86_400_000).toISOString();
    void trackInFlight(Promise.resolve(tracked.from("app_errors").delete().lt("created_at", cutoff)));
    await settleWrites();

    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      pkwtReviewsCreated: reviews.created,
      vokasiEndedDemandsCreated,
      staleVokasiDemandsRemoved,
      missingPlanDemandsRepaired,
      supplyPoolEntriesAdded: utilPoolStore.list().length - poolBefore,
      projectsFinished: projectStore.list().filter((p) => p.status === "Finish").length - finishedBefore,
      failures,
    };
  } finally {
    await settleWrites();
    onWriteFailure(null);
    setDataClient(null);
    // Nothing loaded with the service role stays in this server's memory.
    for (const store of JOB_STORES) store.reset();
    running = false;
  }
}
