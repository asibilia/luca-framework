/**
 * MuninnDB HTTP client for hook checkpoint write/read.
 *
 * Replaces the `curl` calls in `pre-compact-checkpoint.sh`.
 * Uses built-in `fetch` (Bun has it natively) — no external HTTP libraries.
 *
 * Write calls are fire-and-forget — errors are swallowed silently.
 * Read/recall calls return empty arrays on failure (best-effort).
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
export const writeMuninnEngram = async (
  engram: MuninnEngram,
): Promise<void> => {
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

/** Shape of a recalled engram from MuninnDB. */
export interface MuninnRecalledEngram {
  id?: string;
  concept?: string;
  content?: string;
  type?: string;
  tags?: string[];
  created_at?: string;
  score?: number;
}

/**
 * Recalls engrams from MuninnDB using the REST API.
 *
 * Uses `${MUNINN_DB_URL:-http://127.0.0.1:8476}/api/recall` endpoint.
 * 5-second timeout. Returns empty array on any failure (best-effort).
 *
 * @param vault - The vault to recall from
 * @param context - The recall context/query string
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of recalled engrams, or empty array on failure
 */
export const recallMuninnEngrams = async (
  vault: string,
  context: string,
  limit = 5,
): Promise<MuninnRecalledEngram[]> => {
  const baseUrl = process.env.MUNINN_DB_URL || "http://127.0.0.1:8476";
  const apiKey = process.env.MUNINN_DB_API_KEY;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const response = await fetch(`${baseUrl}/api/recall`, {
      method: "POST",
      headers,
      body: JSON.stringify({ vault, context, limit }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) return [];

    const data = (await response.json()) as
      | MuninnRecalledEngram[]
      | { memories?: MuninnRecalledEngram[] };

    // Handle both array response and wrapped response
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.memories)) return data.memories;
    return [];
  } catch {
    // Best-effort — swallow network errors, timeouts, etc.
    return [];
  }
};
