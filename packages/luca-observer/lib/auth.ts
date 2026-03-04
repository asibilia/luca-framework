import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

/**
 * Validate API key from request headers.
 *
 * If LUCA_OBSERVER_API_KEY is not set, auth is disabled (open mode).
 * If set, the request must include a matching X-API-Key header.
 *
 * Uses `crypto.timingSafeEqual()` to prevent timing-based side-channel
 * attacks when comparing API keys. A length check precedes the call
 * because `timingSafeEqual` throws if the two buffers differ in length.
 *
 * Uses snake_case for API response compatibility.
 *
 * @param request - The incoming request to validate
 * @returns null if authorized, or a 401 NextResponse if unauthorized
 *
 * @example
 * ```typescript
 * import { requireApiKey } from "~/lib/auth";
 *
 * export async function GET(request: Request) {
 *   const authError = requireApiKey(request);
 *   if (authError) return authError;
 *
 *   // ... handle authenticated request
 * }
 * ```
 */
export function requireApiKey(request: Request): NextResponse | null {
  const expectedKey = process.env.LUCA_OBSERVER_API_KEY;
  if (!expectedKey) return null;

  const providedKey = request.headers.get("x-api-key");

  if (!providedKey) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid X-API-Key header" },
      { status: 401 },
    );
  }

  // Length check must precede timingSafeEqual — it throws if lengths differ.
  if (providedKey.length !== expectedKey.length) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid X-API-Key header" },
      { status: 401 },
    );
  }

  const providedBuf = Buffer.from(providedKey, "utf8");
  const expectedBuf = Buffer.from(expectedKey, "utf8");

  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return NextResponse.json(
      { error: "unauthorized", message: "Missing or invalid X-API-Key header" },
      { status: 401 },
    );
  }

  return null;
}
