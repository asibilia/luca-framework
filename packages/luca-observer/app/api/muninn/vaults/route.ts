import { NextResponse } from "next/server";

const MUNINN_BASE_URL = process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476";

/**
 * GET /api/muninn/vaults
 *
 * Lists all available MuninnDB vaults. Returns a JSON array of vault name strings.
 * Proxies MuninnDB's /api/vaults endpoint.
 *
 * Uses MUNINN_DB_DEFAULT_API_KEY or generic MUNINN_DB_API_KEY for auth since
 * this endpoint is vault-agnostic.
 */
export async function GET() {
  const apiKey =
    process.env.MUNINN_DB_DEFAULT_API_KEY ??
    process.env.MUNINN_DB_API_KEY ??
    "";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const res = await fetch(`${MUNINN_BASE_URL}/api/vaults`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `MuninnDB vaults: ${res.status}` },
        { status: 502 },
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch MuninnDB vaults" },
      { status: 502 },
    );
  }
}
