import orderBy from "lodash/orderBy";

import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import { filterByConceptPrefix, parseZoneContent } from "~/lib/muninn-helpers";
import {
  ZoneHistoryQuerySchema,
  ZoneHistoryResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/zone-history
 *
 * Returns historical zone transitions from MuninnDB.
 *
 * Queries MuninnDB for engrams with concept prefix "session:observation",
 * then transforms them into the zone history response format (entries with
 * zone, usage_percent, checked_at).
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
        ["session:observation"],
        limit,
      );

      // Sort by creation time ascending (oldest first) for timeline display
      const sorted = orderBy(
        zoneEngrams,
        (e) => e.created_at as number | undefined,
        "asc",
      );

      // Filter out entries without parseable zone data (e.g. session:observation-work
      // text summaries that produce zone: "unknown") before building the response.
      const withZones = sorted
        .map((e) => {
          const parsed = parseZoneContent(String(e.content ?? ""));
          return { engram: e, parsed };
        })
        .filter(
          ({ parsed }) => parsed.zone != null && parsed.zone !== "unknown",
        );

      // Transform engram content into zone history entries
      const entries = withZones.slice(0, limit).map(({ engram: e, parsed }) => {
        return {
          zone: parsed.zone as string,
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
