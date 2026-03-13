/**
 * GET /api/workflow/topology
 *
 * Returns the Luca autopilot pipeline topology for visualization
 * in the workflow editor.
 *
 * Query params:
 * - complexity: Optional complexity level filter (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL)
 *
 * Returns static curated topology data — no MuninnDB dependency.
 */
import { NextResponse } from "next/server";
import { z } from "zod";

import { parseQueryParams } from "~/lib/muninn-route-helper";
import { getTopology } from "~/lib/workflow-topology";

/**
 * Query parameter schema for topology endpoint.
 *
 * Uses snake_case for API compatibility.
 */
const TopologyQuerySchema = z.object({
  complexity: z
    .enum(["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"])
    .optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const result = parseQueryParams(searchParams, TopologyQuerySchema);
  if (!result.success) return result.response;

  const { complexity } = result.data;
  const topology = getTopology(complexity);

  return NextResponse.json({
    nodes: topology.nodes,
    edges: topology.edges,
    stages: topology.stages,
    selected_complexity: topology.selectedComplexity,
  });
}
