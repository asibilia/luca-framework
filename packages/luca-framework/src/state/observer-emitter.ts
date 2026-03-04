/**
 * Observer emitter — fire-and-forget event emission to luca-observer.
 *
 * Extracted utility to keep bridge.ts free of network I/O.
 * Only emits when LUCA_OBSERVER_URL is set. Silently fails if
 * the observer is not running.
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

/**
 * Emit a fire-and-forget event to the Luca Observer dashboard.
 *
 * Does nothing if LUCA_OBSERVER_URL is not set.
 * Silently catches all errors to avoid disrupting the caller.
 *
 * @param eventType - The event type string (e.g., 'state.transition')
 * @param data - Additional event data to include in the payload
 */
export function emitObserverEvent(
  eventType: string,
  data: Record<string, unknown> = {},
) {
  const url = process.env.LUCA_OBSERVER_URL;
  if (!url) return;

  const payload = {
    event_type: eventType,
    timestamp: new Date().toISOString(),
    ...data,
  };

  fetch(`${url}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2000),
  }).catch(() => {
    // Intentionally swallowed — observer is optional
  });
}
