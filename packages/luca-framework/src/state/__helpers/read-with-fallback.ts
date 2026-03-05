/**
 * Generic SpacetimeDB-primary read with JSON file fallback.
 *
 * Encapsulates the pattern shared by all bridge read handlers:
 * 1. Try SpacetimeDB query via queryOne()
 * 2. If result, extract fields via extractor callback and return
 * 3. On failure, log if LUCA_DEBUG
 * 4. Fall back to stateExists() -> loadPersistedActor() -> extract from snapshot
 *
 * @module luca-state/read-with-fallback
 */
import { queryOne } from "./spacetimedb-client";
import { stateExists, loadPersistedActor } from "../persistence";

/**
 * Configuration for a SpacetimeDB-primary read with JSON file fallback.
 *
 * @typeParam T - The shape of the SpacetimeDB row returned by the SQL query
 * @typeParam R - The shape of the result returned to the caller
 *
 * @param label - Human-readable label for debug logging (e.g., "read-complexity")
 * @param sql - SQL query to execute against SpacetimeDB
 * @param fromRow - Extractor that converts a SpacetimeDB row to the result type.
 *   Return null to signal the row was present but unusable (falls through to fallback).
 * @param fromSnapshot - Extractor that converts a persisted actor snapshot to the result type.
 *   Receives the snapshot context (as a plain record) and the state value string.
 * @param defaults - Default result to return when state is not initialized
 */
interface ReadWithFallbackConfig<T, R> {
  label: string;
  sql: string;
  fromRow: (row: T) => R | null;
  fromSnapshot: (context: Record<string, unknown>, stateValue: string) => R;
  defaults: R;
}

/**
 * Read data using SpacetimeDB as the primary source with JSON file fallback.
 *
 * This function encapsulates the duplicated read pattern across all bridge
 * read handlers, reducing boilerplate while preserving the exact same
 * SpacetimeDB-primary + JSON-fallback semantics.
 *
 * @typeParam T - The shape of the SpacetimeDB row returned by the SQL query
 * @typeParam R - The shape of the result returned to the caller
 *
 * @param config - Configuration specifying the SQL query, extractors, and defaults
 * @returns The extracted result from SpacetimeDB, the JSON file fallback, or defaults
 *
 * @example
 * ```typescript
 * const result = await readWithFallback({
 *   label: "read-complexity",
 *   sql: "SELECT complexity FROM workflow_state WHERE id = 1",
 *   fromRow: (row: { complexity: string }) => ({
 *     complexity: row.complexity,
 *     initialized: true,
 *   }),
 *   fromSnapshot: (ctx) => ({
 *     complexity: ctx.complexity as string,
 *     initialized: true,
 *   }),
 *   defaults: { complexity: "TRIVIAL", initialized: false },
 * });
 * ```
 */
export async function readWithFallback<T, R>(
  config: ReadWithFallbackConfig<T, R>,
): Promise<R> {
  const { label, sql, fromRow, fromSnapshot, defaults } = config;

  // Primary: try SpacetimeDB
  try {
    const row = await queryOne<T>(sql);
    if (row) {
      const result = fromRow(row);
      if (result !== null) return result;
    }
  } catch (err) {
    if (process.env.LUCA_DEBUG) {
      console.error(
        `[bridge] SpacetimeDB unavailable for ${label}, falling back to JSON:`,
        (err as Error).message,
      );
    }
  }

  // Fallback: JSON file
  const exists = await stateExists();
  if (!exists) return defaults;

  const loadResult = await loadPersistedActor();
  if (!loadResult.success) return defaults;

  const snapshot = loadResult.data.getSnapshot();
  return fromSnapshot(
    snapshot.context as unknown as Record<string, unknown>,
    String(snapshot.value),
  );
}
