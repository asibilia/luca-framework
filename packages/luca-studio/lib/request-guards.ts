/**
 * Shared request guard utilities for API route protection.
 *
 * Centralizes common request validation logic (e.g., localhost restriction)
 * so that individual route handlers avoid inline duplication.
 *
 * @module request-guards
 */

/**
 * Check if the request originates from localhost.
 *
 * Inspects the `host` header for `localhost`, `127.0.0.1`, and `[::1]`
 * prefixes. Used to restrict API routes to the local development server.
 *
 * @param request - The incoming HTTP request
 * @returns `true` if the request originates from localhost
 *
 * @example
 * ```typescript
 * if (!isLocalhostRequest(request)) {
 *   return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 * }
 * ```
 */
export function isLocalhostRequest(request: Request): boolean {
  const host = request.headers.get("host") ?? "";
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]")
  );
}
