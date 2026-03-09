import {
  muninnProxyHandler,
  parseQueryParams,
} from "~/lib/muninn-route-helper";
import {
  EntityClustersQuerySchema,
  EntityClustersResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * GET /api/muninn/entity-clusters
 *
 * Returns entity tag co-occurrence clusters. Composed by fetching all engrams
 * and computing pairwise tag co-occurrence counts server-side.
 *
 * Query params:
 * - vault (default: "default")
 * - top_n (default: 20) -- max clusters to return
 * - min_count (default: 2) -- minimum co-occurrence count to include
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, EntityClustersQuerySchema);
  if (!result.success) return result.response;

  const { vault, top_n, min_count } = result.data;

  return muninnProxyHandler(
    (client) => client.entityClusters(vault, top_n, min_count),
    "Failed to compute entity clusters from MuninnDB",
    EntityClustersResponseSchema,
  );
}
