import filter from "lodash/filter";

import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import {
  MetricsQuerySchema,
  MetricsResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/metrics
 *
 * Recalls metric:* engrams from MuninnDB for memory recall effectiveness.
 *
 * Fetches engrams without a tag filter (MuninnDB tags do exact matching,
 * not prefix matching), then filters client-side using concept.startsWith().
 *
 * Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 50)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, MetricsQuerySchema);
  if (!result.success) return result.response;

  const { vault, limit } = result.data;

  return muninnProxyHandler(
    async (client) => {
      // Fetch without tag filter — MuninnDB tags do exact matching, not prefix
      // Use a larger fetch limit to account for post-filter reduction
      const fetchLimit = Math.min(limit * 5, 500);
      const data = await client.listEngrams(vault, fetchLimit, 0);
      const metrics = filter(
        data.engrams ?? [],
        (e) => typeof e.concept === "string" && e.concept.startsWith("metric:"),
      ).slice(0, limit);
      return {
        metrics,
        total: metrics.length,
      };
    },
    "Failed to fetch MuninnDB metrics",
    MetricsResponseSchema,
  );
}
