import { NextResponse } from "next/server";

import { muninnProxyHandler } from "~/lib/muninn-route-helper";
import {
  ExportGraphRequestSchema,
  ExportGraphResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * POST /api/muninn/export-graph
 *
 * Exports the MuninnDB knowledge graph as JSON-LD. Composed by fetching
 * all engrams and assembling entity nodes (and optionally engram nodes)
 * into a JSON-LD graph structure.
 *
 * Accepts JSON body:
 * - vault: string (default: "default")
 * - format: "json-ld" (default: "json-ld")
 * - include_engrams: boolean (default: false) -- include engram nodes in graph
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ExportGraphRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { vault, format, include_engrams } = parsed.data;

  return muninnProxyHandler(
    (client) => client.exportGraph(vault, format, include_engrams),
    "Failed to export graph from MuninnDB",
    ExportGraphResponseSchema,
  );
}
