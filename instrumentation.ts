import type { Instrumentation } from "next";

// Failed server requests (a page or route that threw) go to the error log
// too — see lib/serverErrors. Node runtime only.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("./lib/serverErrors");
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  await recordServerError("server", error.message, {
    stack: error.stack,
    url: request.path,
    context: { method: request.method, routePath: context.routePath, routeType: context.routeType, digest },
  });
};
