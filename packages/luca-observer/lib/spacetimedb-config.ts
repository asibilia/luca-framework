/**
 * SpacetimeDB connection configuration.
 *
 * Reads connection parameters from environment variables with sensible
 * defaults for local development.
 */

/** The WebSocket URI for the SpacetimeDB instance. */
export const SPACETIMEDB_URI =
  process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "ws://localhost:3000";

/** The name of the published SpacetimeDB module. */
export const MODULE_NAME =
  process.env.NEXT_PUBLIC_SPACETIMEDB_MODULE ?? "luca-spacetime";
