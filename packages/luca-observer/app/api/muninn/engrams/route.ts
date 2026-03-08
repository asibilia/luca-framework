import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import {
  EngramsQuerySchema,
  EngramsResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/engrams
 *
 * Proxies MuninnDB engram listing. Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 100)
 * - offset (default: 0)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, EngramsQuerySchema);
  if (!result.success) return result.response;

  const { vault, limit, offset } = result.data;

  return muninnProxyHandler(
    (client) => client.listEngrams(vault, limit, offset),
    "Failed to fetch engrams from MuninnDB",
    EngramsResponseSchema,
  );
}
