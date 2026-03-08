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
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? "50"), 1),
    500,
  );

  try {
    const data = await client.session(vault, limit);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch MuninnDB session data" },
      { status: 502 },
    );
  }
}
