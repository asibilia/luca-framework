/**
 * SpacetimeDB HTTP query client for the Luca workflow state machine.
 *
 * Provides typed query helpers for reading data from SpacetimeDB via its
 * SQL HTTP API. Write operations use `callReducer()` from observer-emitter.ts.
 *
 * SSRF Protection: Reuses `isLocalhostUrl()` from observer-emitter to ensure
 * queries only target localhost addresses.
 *
 * @module luca-state/spacetimedb-client
 */
import { isLocalhostUrl } from "./observer-emitter";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default SpacetimeDB URL (matches observer-emitter). */
const DEFAULT_STDB_URL = "http://localhost:3000";

/** Database name for the observer module (configurable via LUCA_SPACETIMEDB_DB). */
const DB_NAME = process.env.LUCA_SPACETIMEDB_DB || "luca-observer";

/** Timeout for all SpacetimeDB queries (ms). */
const QUERY_TIMEOUT_MS = 2000;

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the SpacetimeDB base URL from environment variables.
 *
 * Checks `LUCA_SPACETIMEDB_URL`, then `LUCA_OBSERVER_URL`, then falls back
 * to the default localhost URL.
 *
 * @returns The resolved base URL
 */
function getStdbUrl(): string {
  return (
    process.env.LUCA_SPACETIMEDB_URL ||
    process.env.LUCA_OBSERVER_URL ||
    DEFAULT_STDB_URL
  );
}

// ─── Query Functions ────────────────────────────────────────────────────────

/**
 * Execute a SQL query against SpacetimeDB and return all matching rows.
 *
 * Posts to `${url}/database/${dbName}/sql` with the query string.
 * Validates the URL is localhost before making the request.
 *
 * @param sql - The SQL query to execute
 * @returns Array of rows matching the query
 * @throws If the query fails or SpacetimeDB is unreachable
 *
 * @example
 * ```typescript
 * const entries = await queryTable<LedgerEntry>(
 *   "SELECT * FROM ledger_entries WHERE session_id = 'abc-123'"
 * );
 * ```
 */
export async function queryTable<T>(sql: string): Promise<T[]> {
  const url = getStdbUrl();

  if (!isLocalhostUrl(url)) {
    throw new Error(
      `[spacetimedb-client] URL must point to localhost. Refusing: ${url}`,
    );
  }

  const endpoint = `${url.replace(/\/+$/, "")}/v1/database/${DB_NAME}/sql`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: sql,
    signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `[spacetimedb-client] Query failed (${response.status}): ${await response.text()}`,
    );
  }

  const data: unknown = await response.json();

  // SpacetimeDB v2.0 SQL API returns an array of result sets.
  // Each result set has { schema, rows }. Rows are positional arrays.
  // We convert positional rows to objects using the schema field names.
  if (Array.isArray(data) && data.length > 0) {
    const resultSet = data[0] as {
      schema?: { elements?: Array<{ name?: { some?: string } }> };
      rows?: unknown[][];
    };
    const rows = resultSet?.rows;
    if (!rows || rows.length === 0) return [];

    const fields = resultSet?.schema?.elements?.map((e) => e?.name?.some ?? "");
    if (!fields) return rows as unknown as T[];

    // Convert positional arrays to named objects
    return rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < fields.length; i++) {
        obj[fields[i]!] = (row as unknown[])[i];
      }
      return obj as T;
    });
  }

  return [];
}

/**
 * Execute a SQL query and return the first matching row, or null.
 *
 * Convenience wrapper around `queryTable` that returns only the first result.
 *
 * @param sql - The SQL query to execute
 * @returns The first row or null if no rows match
 * @throws If the query fails or SpacetimeDB is unreachable
 *
 * @example
 * ```typescript
 * const state = await queryOne<WorkflowState>(
 *   "SELECT * FROM workflow_state WHERE id = 1"
 * );
 * if (state) {
 *   console.log(state.complexity);
 * }
 * ```
 */
export async function queryOne<T>(sql: string): Promise<T | null> {
  const rows = await queryTable<T>(sql);
  return rows.length > 0 ? rows[0]! : null;
}
