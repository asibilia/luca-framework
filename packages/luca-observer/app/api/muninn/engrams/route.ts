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
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? "100"), 1),
    1000,
  );
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  try {
    const data = await client.listEngrams(vault, limit, offset);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch engrams from MuninnDB" },
      { status: 502 },
    );
  }
}
