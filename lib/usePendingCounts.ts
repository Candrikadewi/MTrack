"use client";
import { useMemo } from "react";
import { useStoreList } from "./useStore";
import { demandStore, utilPoolStore } from "./repo";
import { isDemandDue } from "./engine/enrollment";
import type { Demand, UtilPoolEntry } from "./types";

/** MP still to fulfil: demand not yet verified, counted the same way as
 * the Demand page's Ringkasan per Batch (No Replace excluded, Vokasi from
 * the month its batch ends). */
export function isPendingDemand(d: Demand): boolean {
  return d.status !== "Fulfilled" && d.replacement_status !== "No Replace" && isDemandDue(d);
}

/** MP in Supply Pool not yet utilized. */
export function isPendingSupply(e: UtilPoolEntry): boolean {
  return e.status === "Open";
}

/** Always-visible counts for the navigation badges. */
export function usePendingCounts(): { demand: number; supply: number } {
  const demands = useStoreList(demandStore);
  const pool = useStoreList(utilPoolStore);
  return useMemo(
    () => ({ demand: demands.filter(isPendingDemand).length, supply: pool.filter(isPendingSupply).length }),
    [demands, pool]
  );
}
