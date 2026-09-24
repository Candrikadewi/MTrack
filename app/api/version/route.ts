// The commit the running deployment was built from, read at request time
// (unlike NEXT_PUBLIC_APP_VERSION, which is frozen into each client bundle).
// An open tab whose bundle differs from this is running an older build.
export function GET() {
  return Response.json(
    { version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
