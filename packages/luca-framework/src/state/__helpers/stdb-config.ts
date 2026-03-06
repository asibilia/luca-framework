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
 * 2. DEFAULT_SPACETIMEDB_URL (http://localhost:3000)
 *
 * Note: LUCA_OBSERVER_URL was previously in this fallback chain but was
 * removed because it points to the Next.js observer app (port 3456), NOT
 * SpacetimeDB (port 3000). Including it caused SpacetimeDB SQL queries
 * to hit the Next.js server, producing 404s.
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
  return process.env.LUCA_SPACETIMEDB_URL || DEFAULT_SPACETIMEDB_URL;
}
