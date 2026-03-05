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
 * Checks LUCA_SPACETIMEDB_URL, then LUCA_OBSERVER_URL, then falls back
 * to the default localhost URL.
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
