import { NextResponse } from "next/server";

import { getMuninnClient } from "~/lib/muninn-config";

/**
 * GET /api/muninn/stats
 *
 * Proxies MuninnDB vault statistics. Accepts optional query param:
 * - vault (default: "default")
 */
export async function GET(request: Request) {
  const client = getMuninnClient();
  const { searchParams } = new URL(request.url);
  const vault = searchParams.get("vault") ?? "default";

  try {
    const data = await client.stats(vault);
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "MuninnDB request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
