/**
 * Observer emitter — fire-and-forget event emission to SpacetimeDB.
 *
 * Sends events to SpacetimeDB via its HTTP reducer API.
 * Defaults to http://localhost:3000 (SpacetimeDB standalone default).
 * Silently fails if SpacetimeDB is not running.
 *
 * SSRF Protection: Only localhost addresses are allowed as emission
 * targets to prevent server-side request forgery.
 *
 * @example
 * ```typescript
 * import { emitObserverEvent } from './observer-emitter'
 * emitObserverEvent('state.transition', {
 *   sessionId: 'abc-123',
 *   payload: { from: 'executing', to: 'verifying' },
 * })
 * ```
 */

import { DATABASE_NAME, resolveStdbUrl } from "./stdb-config";

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
 * Build the SpacetimeDB reducer HTTP API URL.
 *
 * @param baseUrl - The SpacetimeDB base URL (e.g., http://localhost:3000)
 * @param reducerName - The reducer function name (e.g., ingest_event)
 * @returns The full URL for the reducer call
 */
function buildReducerUrl(baseUrl: string, reducerName: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/v1/database/${DATABASE_NAME}/call/${reducerName}`;
}

/**
 * Call a SpacetimeDB reducer via HTTP API (fire-and-forget).
 *
 * This is the low-level function used by all higher-level emitters.
 * Silently catches all errors to avoid disrupting the caller.
 *
 * @param reducerName - The reducer function name
 * @param args - The arguments to pass to the reducer
 */
export function callReducer(
  reducerName: string,
  args: Record<string, unknown>,
): void {
  const url = resolveStdbUrl();

  if (!isLocalhostUrl(url)) {
    console.error(
      `[observer-emitter] SpacetimeDB URL must point to localhost. Refusing to call: ${url}`,
    );
    return;
  }

  const reducerUrl = buildReducerUrl(url, reducerName);

  const opts: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(2000),
  };

  fetch(reducerUrl, opts).catch(async (err) => {
    if (process.env.LUCA_DEBUG) {
      console.error(
        `[observer-emitter] Reducer ${reducerName} failed, retrying:`,
        (err as Error).message,
      );
    }
    // Single retry after 1s for transient failures
    await new Promise((r) => setTimeout(r, 1000));
    return fetch(reducerUrl, {
      ...opts,
      signal: AbortSignal.timeout(2000),
    }).catch((retryErr) => {
      // Always log retry failures — this represents actual data loss.
      // First-attempt failures are LUCA_DEBUG-only because a retry follows.
      console.error(
        `[observer-emitter] Reducer ${reducerName} retry failed (data loss):`,
        (retryErr as Error).message,
      );
    });
  });
}

/**
 * Emit a fire-and-forget event to SpacetimeDB via the ingest_event reducer.
 *
 * This is the primary ingestion function that replaces the old HTTP POST
 * to /api/events. The ingest_event reducer also upserts the sessions table.
 *
 * @param eventType - The event type string (e.g., 'state.transition')
 * @param data - Additional event data to include in the payload
 */
export function emitObserverEvent(
  eventType: string,
  data: Record<string, unknown> = {},
): void {
  callReducer("ingest_event", {
    eventType,
    sessionId: (data.sessionId as string) || (data.session_id as string) || "",
    agentName: (data.agentName as string) || (data.agent_name as string) || "",
    toolName: (data.toolName as string) || (data.tool_name as string) || "",
    filePath: (data.filePath as string) || (data.file_path as string) || "",
    durationMs:
      (data.durationMs as number) || (data.duration_ms as number) || 0,
    eventData: JSON.stringify(data),
    timestamp: Date.now(),
  });
}

/**
 * Log a tool call to SpacetimeDB via the log_tool_call reducer.
 *
 * @param params - Tool call parameters
 */
export function logToolCall(params: {
  sessionId: string;
  toolName: string;
  durationMs: number;
  inputSize: number;
  outputSize: number;
  turnNumber: number;
}): void {
  callReducer("log_tool_call", {
    ...params,
    timestamp: Date.now(),
  });
}

/**
 * Log token usage to SpacetimeDB via the log_token_usage reducer.
 *
 * @param params - Token usage parameters
 */
export function logTokenUsage(params: {
  sessionId: string;
  turnNumber: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}): void {
  callReducer("log_token_usage", {
    ...params,
    timestamp: Date.now(),
  });
}

/**
 * Update cost tracking in SpacetimeDB via the update_cost reducer.
 *
 * @param params - Cost tracking parameters
 */
export function updateCost(params: {
  sessionId: string;
  inputCostCents: number;
  outputCostCents: number;
  totalCostCents: number;
  turnCount: number;
}): void {
  callReducer("update_cost", {
    ...params,
    timestamp: Date.now(),
  });
}

/**
 * Snapshot context usage to SpacetimeDB via the snapshot_context reducer.
 *
 * @param params - Context snapshot parameters
 */
export function snapshotContext(params: {
  sessionId: string;
  contextPercent: number;
  messageCount: number;
  estimatedTokens: number;
  phase: string;
}): void {
  callReducer("snapshot_context", {
    ...params,
    timestamp: Date.now(),
  });
}

/**
 * Log a decision to SpacetimeDB via the log_decision reducer.
 *
 * @param params - Decision log parameters
 */
export function logDecision(params: {
  sessionId: string;
  decisionType: string;
  chosenApproach: string;
  alternativesJson: string;
  reasoning: string;
}): void {
  callReducer("log_decision", {
    ...params,
    timestamp: Date.now(),
  });
}
