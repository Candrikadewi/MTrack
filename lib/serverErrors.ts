import "server-only";
// Server-side counterpart of lib/errorLog: failed server requests
// (instrumentation.ts) and nightly job problems go to the same app_errors
// table. Needs SUPABASE_SERVICE_ROLE_KEY; without it only the server log
// (Vercel → Logs) has them.
import { createClient } from "@supabase/supabase-js";

export async function recordServerError(
  source: "server" | "job",
  message: string,
  details: { stack?: string; url?: string; context?: Record<string, unknown> } = {}
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.from("app_errors").insert({
      source,
      message: message.slice(0, 2000),
      stack: details.stack?.slice(0, 8000) ?? null,
      url: details.url?.slice(0, 1000) ?? null,
      context: details.context ?? {},
    });
    if (error) console.warn("error log unavailable:", error.message);
  } catch (err) {
    console.warn("error log unavailable:", err);
  }
}
