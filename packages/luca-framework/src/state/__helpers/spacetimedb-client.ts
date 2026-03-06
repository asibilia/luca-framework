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
import { createCircuitBreaker } from "./circuit-breaker";
import { isLocalhostUrl } from "./observer-emitter";
import { DATABASE_NAME, resolveStdbUrl } from "./stdb-config";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Timeout for all SpacetimeDB queries (ms). */
const QUERY_TIMEOUT_MS = 2000;

// ─── Circuit Breaker ────────────────────────────────────────────────────────

/** Circuit breaker for SQL queries -- skips attempts during cooldown. */
const queryBreaker = createCircuitBreaker(30_000);

/**
 * Reset the circuit breaker (e.g., after a successful query).
 * Exported for testing only.
 */
export function _resetCircuitBreaker(): void {
  queryBreaker.reset();
}

// ─── Query Functions ────────────────────────────────────────────────────────

/**
 * Execute a SQL query against SpacetimeDB and return all matching rows.
 *
 * Posts to `${url}/database/${dbName}/sql` with the query string.
 * Validates the URL is localhost before making the request.
 *
 * @security **Raw SQL Interface** -- This function passes the `sql` parameter
 * directly to SpacetimeDB's SQL HTTP API without parameterization. SpacetimeDB
 * does not currently support prepared statements via its HTTP API.
 *
 * **Injection Mitigation Strategy (defense-in-depth):**
 * 1. **Static SQL**: Most callers use static SQL strings with no interpolation
 *    (e.g., `"SELECT * FROM workflow_state WHERE id = 1"`).
 * 2. **Validated integers**: Callers that interpolate values use `parseInt()`
 *    with `Number.isFinite()` validation before interpolation (e.g.,
 *    `phaseId` in bridge.ts and suspend-checkpoint.ts).
 * 3. **Allowlist validation**: Dynamic string values (session_id, event_type)
 *    are validated via `validateLedgerFilters()` in ledger.ts, which uses
 *    regex allowlists and enum checks before any SQL interpolation.
 * 4. **Belt-and-suspenders escaping**: Even after validation, string values
 *    are escaped with `.replace(/'/g, "''")` as a secondary safety layer.
 * 5. **Localhost-only**: SSRF guard ensures queries only target localhost,
 *    limiting blast radius even if injection occurs.
 *
 * **Safe caller patterns:**
 * - `bridge.ts`: All read handlers use static SQL or validated integers
 * - `ledger.ts`: Uses `validateLedgerFilters()` before building WHERE clauses
 * - `suspend-checkpoint.ts`: Uses `parseInt()`-validated `phaseId`
 *
 * **Do NOT** pass unsanitized user input to this function. All callers must
 * validate/sanitize interpolated values before constructing the SQL string.
 *
 * @param sql - The SQL query to execute. Must use only static strings or
 *   pre-validated values. Never interpolate raw user input.
 * @returns Array of rows matching the query
 * @throws If the query fails or SpacetimeDB is unreachable
 *
 * @example
 * ```typescript
 * // Safe: static SQL
 * const state = await queryTable<WorkflowState>(
 *   "SELECT * FROM workflow_state WHERE id = 1"
 * );
 *
 * // Safe: parseInt-validated integer
 * const phaseId = parseInt(rawPhaseId, 10);
 * if (!Number.isFinite(phaseId)) throw new Error("Invalid phase");
 * const checkpoint = await queryTable<Checkpoint>(
 *   `SELECT * FROM suspend_checkpoints WHERE phaseId = ${phaseId}`
 * );
 *
 * // UNSAFE: raw string interpolation
 * // const bad = await queryTable(`SELECT * FROM t WHERE name = '${userInput}'`);
 * ```
 */
export async function queryTable<T>(sql: string): Promise<T[]> {
  // Circuit breaker: skip HTTP if SpacetimeDB was recently unreachable.
  // Prevents hammering a non-SpacetimeDB server with repeated 404s.
  if (queryBreaker.isOpen()) {
    return [];
  }

  const url = resolveStdbUrl();

  if (!isLocalhostUrl(url)) {
    throw new Error(
      `[spacetimedb-client] URL must point to localhost. Refusing: ${url}`,
    );
  }

  const endpoint = `${url.replace(/\/+$/, "")}/v1/database/${DATABASE_NAME}/sql`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: sql,
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
  } catch (err) {
    // Connection refused, timeout, etc. — trip the circuit breaker.
    queryBreaker.trip();
    throw err;
  }

  if (!response.ok) {
    // Non-2xx (e.g., 404 from wrong server) — trip the circuit breaker.
    queryBreaker.trip();
    throw new Error(
      `[spacetimedb-client] Query failed (${response.status}): ${await response.text()}`,
    );
  }

  // Success — reset circuit breaker
  queryBreaker.reset();

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
