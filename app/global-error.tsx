"use client";
import { useEffect } from "react";
import { logError } from "@/lib/errorLog";

/** Last resort when even the app's frame fails. Renders its own document
 * (no global styles reach here), so it's styled inline and kept minimal. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    logError({
      source: "render",
      message: error.message || "Render error",
      stack: error.stack,
      context: { digest: error.digest, global: true },
    });
  }, [error]);

  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#0f172a" }}>
        <title>CAMP — terjadi kesalahan</title>
        <main role="alert" style={{ maxWidth: 420, margin: "96px auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, margin: 0 }}>CAMP gagal dimuat</h1>
          <p style={{ fontSize: 14, color: "#475569" }}>Data kamu aman. Coba muat ulang; kalau masih gagal, kabari admin.</p>
          {error.digest && <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>Kode: {error.digest}</p>}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              borderRadius: 12,
              border: 0,
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Coba lagi
          </button>
        </main>
      </body>
    </html>
  );
}
