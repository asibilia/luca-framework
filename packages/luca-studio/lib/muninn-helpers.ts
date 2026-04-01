/**
 * Shared helpers for MuninnDB data processing in route handlers and hooks.
 *
 * Provides reusable utilities for common MuninnDB operations like
 * concept prefix filtering and zone content parsing that are used
 * across multiple routes and client-side hooks.
 */
import filter from "lodash/filter";

import type { MuninnClient } from "~/lib/muninn-config";
import type { MuninnEngram } from "~/lib/muninn-types";

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
): Promise<MuninnEngram[]> {
  // Over-fetch to account for post-filter reduction
  const fetchLimit = Math.min(limit * 5, 500);
  const data = await client.listEngrams(vault, fetchLimit, 0);

  const filtered = filter(
    data.engrams ?? [],
    (e: MuninnEngram) =>
      typeof e.concept === "string" &&
      prefixes.some((prefix) => e.concept.startsWith(prefix)),
  );

  return filtered.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Zone content parsing
// ---------------------------------------------------------------------------

/**
 * Parse zone data from an engram content string.
 *
 * Engram content may contain structured data in two formats:
 * - JSON: `{ "zone": "PEAK", "usage_percent": 15, "checked_at": "..." }`
 * - Structured text: `"Zone: PEAK, Usage: 15%, Checked: 2026-03-27T12:00:00Z"`
 *
 * All returned fields are optional — parsing falls back gracefully when
 * the content does not match the expected shape.
 *
 * @param content - Raw engram content string
 * @returns Parsed zone fields (zone, usage_percent, checked_at — all optional)
 *
 * @example
 * ```typescript
 * const { zone, usage_percent } = parseZoneContent('{"zone":"PEAK","usage_percent":15}');
 * // zone === "PEAK", usage_percent === 15
 *
 * const { zone: z } = parseZoneContent("Zone: GOOD, Usage: 32%");
 * // z === "GOOD"
 * ```
 */
export function parseZoneContent(content: string): {
  zone?: string;
  usage_percent?: number;
  checked_at?: string;
} {
  // Try JSON parse first
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        zone: typeof parsed.zone === "string" ? parsed.zone : undefined,
        usage_percent:
          typeof parsed.usage_percent === "number"
            ? parsed.usage_percent
            : undefined,
        checked_at:
          typeof parsed.checked_at === "string" ? parsed.checked_at : undefined,
      };
    }
  } catch {
    /* not JSON -- try regex patterns */
  }

  // Try structured text patterns
  const zoneMatch = content.match(/zone:\s*(\w+)/i);
  const usageMatch = content.match(/usage:\s*([\d.]+)%?/i);
  const checkedMatch = content.match(
    /checked(?:_at)?:\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/i,
  );

  return {
    zone: zoneMatch?.[1],
    usage_percent: usageMatch ? parseFloat(usageMatch[1]!) : undefined,
    checked_at: checkedMatch?.[1],
  };
}
