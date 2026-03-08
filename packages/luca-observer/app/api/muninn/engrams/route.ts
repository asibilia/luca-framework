import { NextResponse } from "next/server";

import { getMuninnClient } from "~/lib/muninn-config";

/**
 * GET /api/muninn/engrams
 *
 * Proxies MuninnDB engram listing. Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 100)
 * - offset (default: 0)
 */
export async function GET(request: Request) {
  const client = getMuninnClient();
  const { searchParams } = new URL(request.url);
  const vault = searchParams.get("vault") ?? "default";
  const limit = Number(searchParams.get("limit") ?? "100");
  const offset = Number(searchParams.get("offset") ?? "0");

  try {
    const data = await client.listEngrams(vault, limit, offset);
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "MuninnDB request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
