/**
 * Lightweight MuninnDB HTTP client for writing engrams.
 *
 * Replicates the HTTP client pattern from `packages/luca-studio/lib/muninn-config.ts`
 * but built locally for the framework package (no cross-package imports).
 *
 * Uses Bun native `fetch`, AbortController for timeout, and Bearer auth.
 * Never throws -- returns `{ id: string } | null` on success/failure.
 *
 * CRITICAL: Uses `POST /api/engrams` (NOT `/api/remember`).
 *
 * @module emitter/muninn-http
 */
import type { EmissionEngram } from "../__schemas/emitter.schemas";

/**
 * MuninnDB HTTP client configuration.
 *
 * Extracted from the top-level EmitterConfig for use by the HTTP client.
 */
interface MuninnHttpConfig {
  /** MuninnDB HTTP API base URL (e.g., "http://127.0.0.1:8476"). */
  base_url: string;
  /** Bearer token for authentication. Empty string means no auth. */
  api_key: string;
  /** HTTP request timeout in milliseconds. */
  timeout_ms: number;
}

/**
 * Return type for the MuninnDB HTTP client.
 *
 * Provides a single `writeEngram` method for writing engrams to MuninnDB.
 */
export interface MuninnHttpClient {
  /** Write a single engram to MuninnDB. Returns the created engram ID, or null on failure. */
  writeEngram: (engram: EmissionEngram) => Promise<{ id: string } | null>;
}

/**
 * Create a MuninnDB HTTP client for writing engrams.
 *
 * Factory function that returns an object with a `writeEngram` method.
 * Follows the singleton pattern from `packages/luca-studio/lib/muninn-config.ts`.
 *
 * The client never throws. All failures return null and are safe for
 * fire-and-forget usage.
 *
 * @param config - MuninnDB connection configuration
 * @returns MuninnDB HTTP client with writeEngram method
 *
 * @example
 * ```typescript
 * const client = createMuninnHttpClient({
 *   base_url: "http://127.0.0.1:8476",
 *   api_key: "",
 *   timeout_ms: 5000,
 * });
 * const result = await client.writeEngram(engram);
 * // result: { id: "abc-123" } or null
 * ```
 */
export function createMuninnHttpClient(
  config: MuninnHttpConfig,
): MuninnHttpClient {
  const { base_url, api_key, timeout_ms } = config;

  return {
    async writeEngram(engram: EmissionEngram): Promise<{ id: string } | null> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeout_ms);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (api_key) {
          headers["Authorization"] = `Bearer ${api_key}`;
        }

        const res = await fetch(`${base_url}/api/engrams`, {
          method: "POST",
          headers,
          body: JSON.stringify(engram),
          signal: controller.signal,
        });

        if (!res.ok) return null;
        return (await res.json()) as { id: string };
      } catch {
        return null;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
