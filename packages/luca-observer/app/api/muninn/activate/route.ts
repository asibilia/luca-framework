import { NextResponse } from "next/server";

import { getMuninnClient } from "~/lib/muninn-config";

/**
 * POST /api/muninn/activate
 *
 * Proxies MuninnDB semantic recall (activate). Accepts JSON body:
 * - context: string[] (required) — search terms for semantic recall
 * - vault: string (default: "default")
 * - limit: number (default: 20)
 */
export async function POST(request: Request) {
  const client = getMuninnClient();

  let body: { context?: string[]; vault?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const context = body.context;
  if (!Array.isArray(context) || context.length === 0) {
    return NextResponse.json(
      { error: "context must be a non-empty string array" },
      { status: 400 },
    );
  }

  const vault = body.vault ?? "default";
  const limit = body.limit ?? 20;

  try {
    const data = await client.activate(vault, context, limit);
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "MuninnDB request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
