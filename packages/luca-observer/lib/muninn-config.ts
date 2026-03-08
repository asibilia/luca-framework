/**
 * Server-only MuninnDB configuration and client.
 *
 * NEVER import this from client components — the API key must stay server-side.
 * Client components should fetch from /api/muninn/* proxy routes instead.
 *
 * MuninnDB REST API endpoints used:
 * - GET  /api/engrams?vault=V&limit=N&offset=N  — paginated engram listing
 * - POST /api/activate { vault, context[], limit } — semantic recall
 * - GET  /api/stats?vault=V                      — vault statistics
 * - GET  /api/session?vault=V&limit=N            — session activity
 * - GET  /api/health                             — connectivity check
 */

const MUNINN_BASE_URL = process.env.MUNINN_DB_URL ?? "http://127.0.0.1:8476";
const MUNINN_API_KEY = process.env.MUNINN_DB_API_KEY ?? "";
const MUNINN_TIMEOUT = 10_000;

// -- Response types (server-side, match MuninnDB REST API shapes) ----------

export interface MuninnEngram {
  id: string;
  concept: string;
  content: string;
  confidence: number;
  tags: string[];
  vault: string;
  created_at: number;
  embed_dim?: number;
}

export interface MuninnActivation {
  id: string;
  concept: string;
  content: string;
  score: number;
  confidence: number;
  score_components?: Record<string, number>;
  dormant?: boolean;
  source_type?: string;
}

export interface MuninnSessionEntry {
  id: string;
  concept: string;
  content: string;
  created_at: number;
}

export interface MuninnStatsResponse {
  engram_count: number;
  vault_count: number;
  index_size: number;
  storage_bytes: number;
  coherence?: Record<
    string,
    {
      score: number;
      orphan_ratio: number;
      contradiction_density: number;
      duplication_pressure: number;
      temporal_variance: number;
      total_engrams: number;
    }
  >;
}

export interface MuninnHealthResponse {
  status: string;
  version: string;
  uptime_seconds: number;
  db_writable: boolean;
}

// -- Client ----------------------------------------------------------------

/**
 * Lightweight MuninnDB REST client (server-side only).
 *
 * Uses the MuninnDB HTTP API directly instead of the unpublished @muninndb/client
 * SDK. Provides the same functionality needed by the Route Handler proxy layer.
 */
export interface MuninnClient {
  listEngrams(
    vault: string,
    limit?: number,
    offset?: number,
  ): Promise<{ engrams: MuninnEngram[]; total: number }>;

  activate(
    vault: string,
    context: string[],
    limit?: number,
  ): Promise<{ activations: MuninnActivation[]; total_found: number }>;

  stats(vault: string): Promise<MuninnStatsResponse>;

  session(
    vault: string,
    limit?: number,
  ): Promise<{ entries: MuninnSessionEntry[]; total: number }>;

  health(): Promise<MuninnHealthResponse>;
}

async function muninnFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${MUNINN_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (MUNINN_API_KEY) {
    headers["Authorization"] = `Bearer ${MUNINN_API_KEY}`;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MUNINN_TIMEOUT);
  try {
    return await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function createMuninnClient(): MuninnClient {
  return {
    async listEngrams(vault, limit = 100, offset = 0) {
      const res = await muninnFetch(
        `/api/engrams?vault=${encodeURIComponent(vault)}&limit=${limit}&offset=${offset}`,
      );
      if (!res.ok) throw new Error(`MuninnDB engrams: ${res.status}`);
      return res.json();
    },

    async activate(vault, context, limit = 20) {
      const res = await muninnFetch("/api/activate", {
        method: "POST",
        body: JSON.stringify({ vault, context, limit }),
      });
      if (!res.ok) throw new Error(`MuninnDB activate: ${res.status}`);
      return res.json();
    },

    async stats(vault) {
      const res = await muninnFetch(
        `/api/stats?vault=${encodeURIComponent(vault)}`,
      );
      if (!res.ok) throw new Error(`MuninnDB stats: ${res.status}`);
      return res.json();
    },

    async session(vault, limit = 50) {
      const res = await muninnFetch(
        `/api/session?vault=${encodeURIComponent(vault)}&limit=${limit}`,
      );
      if (!res.ok) throw new Error(`MuninnDB session: ${res.status}`);
      return res.json();
    },

    async health() {
      const res = await muninnFetch("/api/health");
      if (!res.ok) throw new Error(`MuninnDB health: ${res.status}`);
      return res.json();
    },
  };
}

/** Singleton MuninnDB client (server-side only). */
let _client: MuninnClient | null = null;

/**
 * Returns a singleton MuninnDB client, or null if the server cannot be reached.
 *
 * The client works with or without MUNINN_DB_API_KEY:
 * - With key: sends Authorization header (production)
 * - Without key: omits header (local development where MuninnDB has no auth)
 */
export function getMuninnClient(): MuninnClient {
  if (!_client) {
    _client = createMuninnClient();
  }
  return _client;
}
