import orderBy from "lodash/orderBy";

import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import { filterByConceptPrefix } from "~/lib/muninn-helpers";
import {
  ZoneHistoryQuerySchema,
  ZoneHistoryResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/zone-history
 *
 * Returns historical zone transitions from MuninnDB.
 *
 * Queries MuninnDB for engrams with concept prefix "session:context-zone"
 * or "metric:context-zone", then transforms them into the zone history
 * response format (entries with zone, usage_percent, checked_at).
 *
 * Previously read a single-snapshot `.planning/.context-metrics.json` file,
 * which only contained the most recent zone check. Now queries MuninnDB
 * to provide a full timeline of zone transitions.
 *
 * Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 100)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, ZoneHistoryQuerySchema);
  if (!result.success) return result.response;

  const { vault, limit } = result.data;

  return muninnProxyHandler(
    async (client) => {
      const zoneEngrams = await filterByConceptPrefix(
        client,
        vault,
        ["session:context-zone", "metric:context-zone"],
        limit,
      );

      // Sort by creation time ascending (oldest first) for timeline display
      const sorted = orderBy(
        zoneEngrams,
        (e) => e.created_at as number | undefined,
        "asc",
      );

      // Transform engram content into zone history entries
      const entries = sorted.slice(0, limit).map((e) => {
        // Parse structured zone data from engram content
        const parsed = parseZoneContent(String(e.content ?? ""));
        return {
          zone:
            parsed.zone ??
            (typeof e.concept === "string"
              ? e.concept.split(":").pop()
              : undefined) ??
            "unknown",
          usage_percent: parsed.usage_percent,
          checked_at:
            parsed.checked_at ??
            (typeof e.created_at === "number"
              ? new Date(e.created_at).toISOString()
              : String(e.created_at)),
        };
      });

      return {
        entries,
        total: entries.length,
      };
    },
    "Failed to fetch MuninnDB zone history",
    ZoneHistoryResponseSchema,
  );
}

/**
 * Parse zone data from engram content string.
 *
 * Engram content may contain structured data like:
 * - "Zone: PEAK, Usage: 15%, Checked: 2026-03-27T12:00:00Z"
 * - JSON: { "zone": "PEAK", "usage_percent": 15, "checked_at": "..." }
 * - Plain text description of zone transition
 *
 * @param content - Raw engram content string
 * @returns Parsed zone fields (all optional, falls back gracefully)
 */
function parseZoneContent(content: string): {
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
