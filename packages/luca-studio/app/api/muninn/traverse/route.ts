import { NextResponse } from "next/server";

import { muninnProxyHandler } from "~/lib/muninn-route-helper";
import {
  TraverseRequestSchema,
  TraverseResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * POST /api/muninn/traverse
 *
 * Proxies MuninnDB graph traversal. Accepts JSON body:
 * - start_id: string (required) -- engram ID to start traversal from
 * - vault: string (default: "default")
 * - max_hops: number (default: 2)
 * - max_nodes: number (default: 50)
 * - follow_entities: boolean (default: true)
 * - rel_types: string[] (optional) -- filter by relationship types
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = TraverseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { vault, start_id, max_hops, max_nodes, follow_entities, rel_types } =
    parsed.data;

  return muninnProxyHandler(
    (client) =>
      client.traverse(
        vault,
        start_id,
        max_hops,
        max_nodes,
        follow_entities,
        rel_types,
      ),
    "Failed to traverse MuninnDB graph",
    TraverseResponseSchema,
  );
}
