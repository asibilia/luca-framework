/**
 * Shared helpers for MuninnDB data processing in route handlers.
 *
 * Provides reusable utilities for common MuninnDB operations like
 * concept prefix filtering that are duplicated across multiple routes.
 */
import filter from "lodash/filter";

import type { MuninnClient } from "~/lib/muninn-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Minimal engram shape needed for concept prefix filtering.
 *
 * MuninnDB engrams have many fields, but filtering only needs the concept
 * string. Using a minimal type avoids coupling to the full engram shape.
 */
type EngramLike = {
  concept?: string | null;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Concept prefix filtering
// ---------------------------------------------------------------------------

/**
 * Fetch engrams from MuninnDB and filter by one or more concept prefixes.
 *
 * MuninnDB tags support exact matching only, not prefix matching. This helper
 * implements client-side prefix filtering by fetching a larger batch of engrams
 * and filtering locally using `concept.startsWith()`.
 *
 * Uses a 5x over-fetch ratio (capped at 500) to account for post-filter
 * reduction, then slices to the requested limit.
 *
 * @param client   - MuninnDB client instance
 * @param vault    - Vault name to query
 * @param prefixes - One or more concept prefixes to match (e.g. "metric:", "session:observation")
 * @param limit    - Maximum number of filtered results to return
 * @returns Array of engrams whose concept starts with one of the given prefixes
 *
 * @example
 * ```typescript
 * // Single prefix
 * const metrics = await filterByConceptPrefix(client, "default", ["metric:"], 50);
 *
 * // Multiple prefixes
 * const zones = await filterByConceptPrefix(
 *   client, "default",
 *   ["session:context-zone", "metric:context-zone"],
 *   100,
 * );
 * ```
 */
export async function filterByConceptPrefix(
  client: MuninnClient,
  vault: string,
  prefixes: string[],
  limit: number,
): Promise<EngramLike[]> {
  // Over-fetch to account for post-filter reduction
  const fetchLimit = Math.min(limit * 5, 500);
  const data = await client.listEngrams(vault, fetchLimit, 0);

  const filtered = filter(
    (data.engrams ?? []) as EngramLike[],
    (e) =>
      typeof e.concept === "string" &&
      prefixes.some((prefix) => e.concept!.startsWith(prefix)),
  );

  return filtered.slice(0, limit);
}
