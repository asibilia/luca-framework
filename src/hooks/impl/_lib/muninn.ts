/**
 * MuninnDB HTTP client for hook checkpoint write/read.
 *
 * Replaces the `curl` calls in `pre-compact-checkpoint.sh`.
 * Uses built-in `fetch` (Bun has it natively) — no external HTTP libraries.
 *
 * All calls are fire-and-forget — errors are swallowed silently.
 *
 * @module muninn
 */

/** Shape of an engram to write to MuninnDB. */
export interface MuninnEngram {
  vault: string;
  concept: string;
  content: string;
  type: string;
  tags: string[];
}

/**
 * POSTs an engram to the MuninnDB REST API.
 *
 * Uses `${MUNINN_DB_URL:-http://127.0.0.1:8476}/api/engrams` endpoint.
 * Sets `Authorization: Bearer ${MUNINN_DB_API_KEY}` header if the env var is set.
 * 5-second timeout. Swallows all errors silently (fire-and-forget).
 *
 * @param engram - The engram object to persist
 */
export const writeMuninnEngram = async (engram: MuninnEngram): Promise<void> => {
  const baseUrl = process.env.MUNINN_DB_URL || "http://127.0.0.1:8476";
  const apiKey = process.env.MUNINN_DB_API_KEY;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    await fetch(`${baseUrl}/api/engrams`, {
      method: "POST",
      headers,
      body: JSON.stringify(engram),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // Fire-and-forget — swallow network errors, timeouts, etc.
  }
};
