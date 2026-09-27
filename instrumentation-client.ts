// Runs in the browser before CAMP becomes interactive: records uncaught
// errors and unhandled promise rejections in the error log (lib/errorLog).
import { errorFromUnknown, logError } from "@/lib/errorLog";

try {
  window.addEventListener("error", (event) => {
    const { message, stack } = errorFromUnknown(event.error ?? event.message);
    logError({ source: "client", message, stack, context: { file: event.filename, line: event.lineno } });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const { message, stack } = errorFromUnknown(event.reason);
    logError({ source: "client", message, stack, context: { kind: "unhandledrejection" } });
  });
} catch {
  // Monitoring must never stop the app from starting.
}
