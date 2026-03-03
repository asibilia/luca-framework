/**
 * Shared JSON persistence helpers for the memory bridge.
 *
 * Provides typed read/write functions for JSON files with Zod validation,
 * matching the pattern used by the state bridge in
 * `packages/luca-framework/src/state/persistence.ts`.
 *
 * All paths are relative to CWD (project root).
 *
 * @module memory/json-persistence
 */
import type { z } from "zod";

import { sanitizeJsonParse } from "~/shared/__helpers/validation-utils";

// ─── JSON File Paths ─────────────────────────────────────────────────────────

/** Default paths for JSON-first memory files. */
export const BRAIN_JSON_PATH = ".planning/brain.json";
export const MEMORY_JSON_PATH = ".planning/memory.json";
export const WORKING_JSON_PATH = ".planning/working.json";
export const PROCEDURES_JSON_PATH = ".planning/procedures.json";

// ─── Result Type ─────────────────────────────────────────────────────────────

/** Minimal success/error result type (matches state bridge convention). */
export type PersistResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Read ────────────────────────────────────────────────────────────────────

/**
 * Read and validate a JSON file against a Zod schema.
 *
 * Returns parsed data on success, or an error if the file is missing,
 * empty, malformed, or fails schema validation.
 *
 * @param filePath - Path to the JSON file (relative to CWD)
 * @param schema - Zod schema to validate the parsed JSON against
 * @returns Validated data or error
 *
 * @example
 * ```typescript
 * const result = await readJsonFile(BRAIN_JSON_PATH, brainSchema);
 * if (result.success) {
 *   console.log(result.data.project_name);
 * }
 * ```
 */
export async function readJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T>,
): Promise<PersistResult<T>> {
  try {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const text = await file.text();
    if (!text.trim()) {
      return { success: false, error: `File is empty: ${filePath}` };
    }

    const raw = sanitizeJsonParse(text);
    const result = schema.safeParse(raw);

    if (!result.success) {
      return {
        success: false,
        error: `Schema validation failed for ${filePath}: ${result.error.message}`,
      };
    }

    return { success: true, data: result.data };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Write ───────────────────────────────────────────────────────────────────

/**
 * Write data to a JSON file with pretty-printing.
 *
 * Creates parent directories if needed. Uses Bun.write for atomic writes.
 *
 * @param filePath - Path to the JSON file (relative to CWD)
 * @param data - Data to serialize and write
 * @returns File path on success, or error
 *
 * @example
 * ```typescript
 * const result = await writeJsonFile(BRAIN_JSON_PATH, brainData);
 * if (result.success) {
 *   console.log(`Wrote ${result.data}`);
 * }
 * ```
 */
export async function writeJsonFile(
  filePath: string,
  data: unknown,
): Promise<PersistResult<string>> {
  try {
    const json = JSON.stringify(data, null, 2);
    await Bun.write(filePath, json);
    return { success: true, data: filePath };
  } catch (err) {
    return {
      success: false,
      error: `Failed to write ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Exists ──────────────────────────────────────────────────────────────────

/**
 * Check whether a JSON file exists and is non-empty.
 *
 * @param filePath - Path to the JSON file
 * @returns true if the file exists and has content
 */
export async function jsonFileExists(filePath: string): Promise<boolean> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return false;
    const text = await file.text();
    return text.trim().length > 0;
  } catch {
    return false;
  }
}
