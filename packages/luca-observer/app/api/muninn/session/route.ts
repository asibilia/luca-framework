import { NextResponse } from "next/server";

import { getMuninnClient } from "~/lib/muninn-config";

/**
 * GET /api/muninn/session
 *
 * Proxies MuninnDB session activity. Accepts optional query params:
 * - vault (default: "default")
 * - limit (default: 50)
 */
export async function GET(request: Request) {
  const client = getMuninnClient();
  const { searchParams } = new URL(request.url);
  const vault = searchParams.get("vault") ?? "default";
  const limit = Number(searchParams.get("limit") ?? "50");

  try {
    const data = await client.session(vault, limit);
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "MuninnDB request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
