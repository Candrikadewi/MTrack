import { createClient } from "@supabase/supabase-js";
import { runDailyJobs } from "@/lib/jobs/daily";
import { recordServerError } from "@/lib/serverErrors";

// Called by Vercel Cron once a day (vercel.json), which sends
// "Authorization: Bearer <CRON_SECRET>". Anyone else gets 401.
//
// Needs two server-only environment variables in Vercel:
//   CRON_SECRET                — any long random string
//   SUPABASE_SERVICE_ROLE_KEY  — Supabase → Project Settings → API
// Without them it does nothing and says which one is missing.

export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 503 });
  }

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const report = await runDailyJobs(client);
    console.log("daily jobs:", JSON.stringify(report));
    for (const failure of report.failures) await recordServerError("job", failure, { url: "/api/jobs/daily" });
    return Response.json(report, { status: report.failures.length ? 207 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("daily jobs failed:", message);
    await recordServerError("job", message, { stack: err instanceof Error ? err.stack : undefined, url: "/api/jobs/daily" });
    return Response.json({ error: message }, { status: 500 });
  }
}
