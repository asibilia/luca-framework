import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import { filterByConceptPrefix } from "~/lib/muninn-helpers";
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
      const metrics = await filterByConceptPrefix(
        client,
        vault,
        ["metric:"],
        limit,
      );
      return {
        metrics,
        total: metrics.length,
      };
    },
    "Failed to fetch MuninnDB metrics",
    MetricsResponseSchema,
  );
}
