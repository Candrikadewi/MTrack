"use client";
import { createContext, useContext } from "react";
import type { Role } from "./roles";

const RoleContext = createContext<Role>("shop");

export function RoleProvider({ role, children }: { role: Role; children: React.ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): Role {
  return useContext(RoleContext);
}
