/**
 * Observer emitter — fire-and-forget event emission to luca-observer.
 *
 * Extracted utility to keep bridge.ts free of network I/O.
 * Defaults to http://localhost:3456 (matching shell hook convention).
 * Silently fails if the observer is not running.
 *
 * SSRF Protection: Only localhost addresses are allowed as emission
 * targets to prevent server-side request forgery.
 *
 * @example
 * ```typescript
 * import { emitObserverEvent } from './observer-emitter'
 * emitObserverEvent('state.transition', {
 *   session_id: 'abc-123',
 *   payload: { from: 'executing', to: 'verifying' },
 * })
 * ```
 */

/** Hosts allowed for observer URL — prevents SSRF by restricting to loopback. */
const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Validate that a URL points to a localhost address.
 *
 * Used as an SSRF guard to ensure LUCA_OBSERVER_URL cannot be
 * pointed at arbitrary remote hosts.
 *
 * @param rawUrl - The URL string to validate
 * @returns true if the URL is a valid localhost URL
 *
 * @example
 * ```typescript
 * isLocalhostUrl('http://localhost:3000')   // true
 * isLocalhostUrl('http://127.0.0.1:3000')  // true
 * isLocalhostUrl('http://[::1]:3000')       // true
 * isLocalhostUrl('http://evil.com:3000')    // false
 * isLocalhostUrl('not-a-url')               // false
 * ```
 */
export function isLocalhostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Emit a fire-and-forget event to the Luca Observer dashboard.
 *
 * Defaults to http://localhost:3456 if LUCA_OBSERVER_URL is not set.
 * Refuses to emit if LUCA_OBSERVER_URL does not point to localhost (SSRF guard).
 * Silently catches all errors to avoid disrupting the caller.
 *
 * @param eventType - The event type string (e.g., 'state.transition')
 * @param data - Additional event data to include in the payload
 */
export function emitObserverEvent(
  eventType: string,
  data: Record<string, unknown> = {},
) {
  const url = process.env.LUCA_OBSERVER_URL || "http://localhost:3456";
  if (!url) return;

  if (!isLocalhostUrl(url)) {
    console.error(
      `[observer-emitter] LUCA_OBSERVER_URL must point to localhost. Refusing to emit to: ${url}`,
    );
    return;
  }

  const payload = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.LUCA_OBSERVER_API_KEY;
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  fetch(`${url}/api/events`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Intentionally swallowed — observer is optional
  });
}
