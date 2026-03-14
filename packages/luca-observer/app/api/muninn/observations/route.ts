import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import {
  ObservationsQuerySchema,
  ObservationsResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/observations
 *
 * Recalls recent session:observation-* engrams from MuninnDB.
 * Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 50)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, ObservationsQuerySchema);
  if (!result.success) return result.response;

  const { vault, limit } = result.data;

  return muninnProxyHandler(
    async (client) => {
      const data = await client.listEngrams(
        vault,
        limit,
        0,
        "session:observation",
      );
      return {
        observations: data.engrams ?? [],
        total: data.total ?? 0,
      };
    },
    "Failed to fetch MuninnDB observations",
    ObservationsResponseSchema,
  );
}
