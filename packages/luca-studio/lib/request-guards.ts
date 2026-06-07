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
 * Parses the `host` header to extract the hostname (stripping any port
 * suffix and IPv6 brackets) and compares for an exact match against
 * known localhost identifiers. This prevents spoofed hostnames like
 * `localhost.evil.com` from passing the guard.
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
    const host = request.headers.get('host') ?? ''
    const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
    return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1'
    )
}
