"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordVisit } from "@/lib/navHistory";

/** Feeds the in-app back stack (see lib/navHistory) on every page change. */
export function NavTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) recordVisit(pathname);
  }, [pathname]);
  return null;
}
