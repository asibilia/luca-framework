import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import { StatsQuerySchema, StatsResponseSchema } from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/stats
 *
 * Proxies MuninnDB vault statistics. Accepts optional query param:
 * - vault (default: "default")
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, StatsQuerySchema);
  if (!result.success) return result.response;

  const { vault } = result.data;

  return muninnProxyHandler(
    (client) => client.stats(vault),
    "Failed to fetch MuninnDB vault statistics",
    StatsResponseSchema,
  );
}
