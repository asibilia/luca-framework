/**
 * POST /api/compile -- Proxy compilation requests to the Bun sidecar.
 *
 * Accepts a JSON body with `domain` and `name`, validates via Zod, then
 * forwards the request to the compilation sidecar on localhost:3457.
 * This route is a thin proxy -- it does NOT import from `src/` or perform
 * compilation itself.
 *
 * Status code mapping:
 * - 200: Compilation succeeded (forwarded from sidecar)
 * - 422: Invalid request body (Zod validation failure)
 * - 502: Sidecar returned a 500 (compilation error)
 * - 503: Sidecar unreachable (connection refused)
 * - 504: Sidecar timed out (>30s)
 * - 404/422: Forwarded directly from sidecar error responses
 */
import { z } from "zod";

import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDECAR_URL = "http://localhost:3457";
const SIDECAR_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

/**
 * Schema for compile proxy request validation.
 *
 * @property domain - The entity domain: agents, skills, or rules
 * @property name   - The entity name within the registry
 * @property format - Target compilation format (default: CLAUDE)
 */
const CompileProxyRequestSchema = z.object({
  domain: z.enum(["agents", "skills", "rules"]),
  name: z.string().min(1),
  format: z.enum(["CLAUDE", "PLUGIN"]).default("CLAUDE"),
});

// ---------------------------------------------------------------------------
// Error detection helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a fetch error indicates the sidecar is unreachable.
 *
 * Checks for common connection-refused error signatures across Bun and Node.
 *
 * @param error - The caught error from fetch()
 * @returns True if the error is a connection refusal / unreachable host
 */
function isSidecarUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("econnrefused") ||
    msg.includes("connection refused") ||
    msg.includes("fetch failed") ||
    msg.includes("unable to connect")
  );
}

/**
 * Map a sidecar HTTP status code to the appropriate proxy status code.
 *
 * @param sidecarStatus - The HTTP status returned by the sidecar
 * @returns The status code this proxy should return
 */
function mapSidecarStatus(sidecarStatus: number): number {
  if (sidecarStatus === 404) return 404;
  if (sidecarStatus === 400 || sidecarStatus === 422) return 422;
  if (sidecarStatus === 500) return 502;
  if (sidecarStatus === 504) return 504;
  // Forward any other error status as-is
  return sidecarStatus;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  // Step 1: Parse JSON body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Step 2: Validate with Zod
  const parseResult = CompileProxyRequestSchema.safeParse(rawBody);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parseResult.error.issues,
      },
      { status: 422 },
    );
  }

  const { domain, name, format } = parseResult.data;

  // Step 3: Forward to sidecar with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SIDECAR_TIMEOUT_MS);

  try {
    const sidecarResponse = await fetch(`${SIDECAR_URL}/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, name, format }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Parse sidecar response body
    let responseBody: unknown;
    try {
      responseBody = await sidecarResponse.json();
    } catch {
      responseBody = { error: "Sidecar returned non-JSON response" };
    }

    // Success path
    if (sidecarResponse.ok) {
      return NextResponse.json(responseBody);
    }

    // Error path -- map sidecar status to proxy status
    const proxyStatus = mapSidecarStatus(sidecarResponse.status);
    return NextResponse.json(responseBody, { status: proxyStatus });
  } catch (error) {
    clearTimeout(timeout);

    // Timeout (AbortController)
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json(
        {
          error:
            "Compilation timed out. The sidecar did not respond within 30 seconds.",
        },
        { status: 504 },
      );
    }

    // Sidecar unreachable
    if (isSidecarUnreachable(error)) {
      return NextResponse.json(
        {
          error:
            "Compilation sidecar is not running. Start it with: bun run sidecar",
        },
        { status: 503 },
      );
    }

    // Unknown fetch error
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Proxy error: ${message}` },
      { status: 502 },
    );
  }
}
