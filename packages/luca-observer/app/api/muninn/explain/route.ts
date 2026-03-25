import { NextResponse } from "next/server";

import { muninnProxyHandler } from "~/lib/muninn-route-helper";
import {
  ExplainRequestSchema,
  ExplainResponseSchema,
} from "~/lib/muninn-schemas";

/**
 * POST /api/muninn/explain
 *
 * Proxies MuninnDB scoring explanation. Accepts JSON body:
 * - engram_id: string (required) -- ID of the engram to explain
 * - query: string[] (required) -- context terms used for scoring
 * - vault: string (default: "default")
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = ExplainRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const { vault, engram_id, query } = parsed.data;

  return muninnProxyHandler(
    (client) => client.explain(vault, engram_id, query),
    "Failed to explain MuninnDB engram scoring",
    ExplainResponseSchema,
  );
}
