/**
 * GET /api/compile/status -- Report compilation sidecar health.
 *
 * Proxies to the sidecar's GET /health endpoint on localhost:3457.
 * Always returns 200 with a structured status object:
 *
 * - Sidecar running: `{ status: "idle", uptime_ms: <number> }`
 * - Sidecar down:    `{ status: "unavailable", error: "Sidecar not running" }`
 *
 * This is a status check, not an action, so sidecar unavailability is
 * reported as data (200) rather than an error (503).
 */
import { NextResponse } from "next/server";

import { SIDECAR_URL } from "~/lib/constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`${SIDECAR_URL}/health`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = {};
      }

      // The sidecar returns { status: "ok", uptime_ms: <number> }
      // We normalize to "idle" to indicate readiness for compilation
      const uptimeMs =
        body !== null &&
        typeof body === "object" &&
        "uptime_ms" in (body as Record<string, unknown>)
          ? (body as Record<string, unknown>).uptime_ms
          : 0;

      return NextResponse.json({
        status: "idle",
        uptime_ms: uptimeMs,
      });
    }

    // Sidecar responded but with an error status
    return NextResponse.json({
      status: "unavailable",
      error: `Sidecar returned HTTP ${String(response.status)}`,
    });
  } catch {
    clearTimeout(timeout);

    // Sidecar unreachable or timed out -- report as data, not error
    return NextResponse.json({
      status: "unavailable",
      error: "Sidecar not running",
    });
  }
}
