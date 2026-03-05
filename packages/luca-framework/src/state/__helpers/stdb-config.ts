/**
 * Shared SpacetimeDB connection configuration.
 *
 * Single source of truth for URL and database name constants,
 * used by both observer-emitter.ts and spacetimedb-client.ts.
 */

/** Default SpacetimeDB URL (standalone server default). */
export const DEFAULT_SPACETIMEDB_URL = "http://localhost:3000";

/** Database name for the observer module (configurable via LUCA_SPACETIMEDB_DB). */
export const DATABASE_NAME = process.env.LUCA_SPACETIMEDB_DB || "luca-observer";

/**
 * Resolve the SpacetimeDB base URL from environment variables.
 *
 * Resolution order:
 * 1. LUCA_SPACETIMEDB_URL (preferred)
 * 2. LUCA_OBSERVER_URL (legacy fallback)
 * 3. DEFAULT_SPACETIMEDB_URL (http://localhost:3000)
 *
 * @returns The resolved base URL
 *
 * @example
 * ```typescript
 * import { resolveStdbUrl } from './stdb-config'
 * const url = resolveStdbUrl() // "http://localhost:3000" (default)
 * ```
 */
export function resolveStdbUrl(): string {
  return (
    process.env.LUCA_SPACETIMEDB_URL ||
    process.env.LUCA_OBSERVER_URL ||
    DEFAULT_SPACETIMEDB_URL
  );
}
