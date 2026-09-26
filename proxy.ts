import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Runs before every page request: refreshes the Supabase session cookie and
// sends signed-out visitors to /login. (Next.js 16 renamed "middleware" to
// "proxy".)
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
