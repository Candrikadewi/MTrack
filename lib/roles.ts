// Client-safe role types/helpers — kept separate from lib/auth.ts so client
// components never pull in the server-only Supabase client (next/headers).
export type Role = "admin" | "shop" | "hr" | "guest";

export const canAccessModule = (role: Role, path: string): boolean => {
  if (role === "admin") return true;
  if (role === "guest") return path.startsWith("/dashboard");
  if (path.startsWith("/upload") || path.startsWith("/handover")) return false;
  return true;
};
