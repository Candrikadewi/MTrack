"use client";
import { createContext, useContext, useEffect } from "react";
import { zparStore } from "./repo";
import type { Role } from "./roles";

const RoleContext = createContext<Role>("shop");

export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  // Warm the ZPAR employee cache as soon as the authenticated shell mounts
  // (not gated on visiting a page that happens to read it first) — pages
  // like Project Monitoring's "+New Project" modal only mount on demand and
  // would otherwise show an empty Divisi/Department dropdown on first open.
  useEffect(() => {
    zparStore.init();
  }, []);

  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  return useContext(RoleContext);
}
