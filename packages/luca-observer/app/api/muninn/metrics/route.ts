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
      const data = await client.listEngrams(vault, limit, 0, "metric:");
      return {
        metrics: data.engrams ?? [],
        total: data.total ?? 0,
      };
    },
    "Failed to fetch MuninnDB metrics",
    MetricsResponseSchema,
  );
}
