/**
 * Generic context file helpers factory.
 *
 * Eliminates ~250 LOC of duplication across the 4 context schema files
 * (lu-context, phase-execute-context, verify-context,
 * milestone-complete-context) by extracting the shared read/write pattern
 * into a generic factory parameterized by Zod schema.
 *
 * Each context file schema defines a `context_version: z.literal(1)` field.
 * The `read()` helper validates the file against the schema via `safeParse`,
 * and the `write()` helper deep-merges a typed patch into the existing file.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Callers MUST check `read().success` and treat `false` as ABORT.
 *
 * **PREMORTEM R2:** The `write` patch parameter type is
 * `Partial<Omit<z.infer<TSchema>, "context_version">>` with NO
 * `& Record<string, unknown>` escape hatch. This preserves type safety
 * so TypeScript catches typos in patch field names.
 *
 * Uses Bun.file/Bun.write for file I/O per project conventions.
 * Uses lodash/merge for deep merge per lodash-preference rule.
 *
 * @module context-helpers
 * @see src/skills/__schemas/lu-context.schemas.ts
 * @see src/skills/__schemas/phase-execute-context.schemas.ts
 * @see src/skills/__schemas/verify-context.schemas.ts
 * @see src/skills/__schemas/milestone-complete-context.schemas.ts
 */

import { chmod, rename, unlink } from "node:fs/promises";

import { z } from "zod";
import merge from "lodash/merge";

// ─── Return Types ──────────────────────────────────────────────────────────

/**
 * Successful read result — schema validation passed.
 */
interface ReadSuccess<T> {
  success: true;
  data: T;
}

/**
 * Failed read result — schema validation failed (missing file, malformed
 * JSON, or missing `context_version`).
 */
interface ReadFailure {
  success: false;
  error: z.ZodError;
}

/**
 * Union return type for `read()`. Matches the existing pattern used by
 * `readLuContext()`, `readPhaseExecuteContext()`, `readVerifyContext()`,
 * and `readMilestoneCompleteContext()`.
 */
export type ContextReadResult<T> = ReadSuccess<T> | ReadFailure;

// ─── Context Helpers ───────────────────────────────────────────────────────

/**
 * Returned object shape from `createContextHelpers()`.
 *
 * Provides typed `read()` and `write()` methods bound to a specific
 * context file path and Zod schema.
 */
export interface ContextHelpers<TSchema extends z.ZodType> {
  /**
   * Read the context file and validate it via safeParse.
   *
   * Returns the safeParse result directly. Callers MUST check `.success`
   * and treat `success: false` as ABORT per PREMORTEM Constraint #1.
   *
   * Behavior:
   * - File does not exist: returns `schema.safeParse({})` (fails on missing `context_version`)
   * - File exists: reads JSON and returns `schema.safeParse(raw)`
   * - Any error (JSON parse, file read): returns `schema.safeParse({})` as fallback
   */
  read: () => Promise<ContextReadResult<z.infer<TSchema>>>;

  /**
   * Write a partial update to the context file.
   *
   * Reads the current file (if it exists), deep-merges the patch via
   * lodash `merge`, forces `context_version = 1`, and writes back.
   * Creates the file with `{ context_version: 1 }` if it does not yet exist.
   *
   * On read error, starts fresh with `{ context_version: 1 }`.
   *
   * The patch type is `Partial<Omit<z.infer<TSchema>, "context_version">>`
   * with NO `Record<string, unknown>` escape hatch, preserving type safety.
   */
  write: (
    patch: Partial<Omit<z.infer<TSchema>, "context_version">>,
  ) => Promise<void>;
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Creates typed read/write helpers for a context file.
 *
 * Generic factory parameterized by a Zod schema. The schema must include
 * a `context_version` field (typically `z.literal(1)`). Returns `{ read, write }`
 * bound to the given file path.
 *
 * @param path - Absolute path to the context JSON file (e.g., `/tmp/lu-context.json`)
 * @param schema - Zod schema for the context file (must include `context_version`)
 * @returns Object with typed `read()` and `write()` methods
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { createContextHelpers } from "./context-helpers";
 *
 * const MyContextSchema = z.object({
 *   context_version: z.literal(1),
 *   my_output: z.object({
 *     status: z.string().default("pending"),
 *   }).optional(),
 * });
 *
 * const MY_CONTEXT_PATH = "/tmp/my-context.json";
 *
 * const { read, write } = createContextHelpers(MY_CONTEXT_PATH, MyContextSchema);
 *
 * // Read and validate
 * const result = await read();
 * if (!result.success) {
 *   // ABORT: context file missing or malformed
 *   return;
 * }
 * const context = result.data;
 *
 * // Write a partial update
 * await write({
 *   my_output: { status: "complete" },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Type safety — typos are caught at compile time:
 * await write({
 *   my_outpu: { status: "complete" }, // TypeScript error: 'my_outpu' not in schema
 * });
 *
 * // context_version cannot be overridden via patch:
 * await write({
 *   context_version: 2, // TypeScript error: 'context_version' is omitted
 * });
 * ```
 */
export const createContextHelpers = <TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): ContextHelpers<TSchema> => {
  /**
   * Read the context file and validate it via safeParse.
   */
  const read = async (): Promise<ContextReadResult<z.infer<TSchema>>> => {
    try {
      const file = Bun.file(path);
      const exists = await file.exists();
      if (!exists) {
        // File does not exist — return a failed parse
        // (will fail because context_version is missing)
        const result = schema.safeParse({});
        return result as ContextReadResult<z.infer<TSchema>>;
      }
      const raw = await file.json();
      const result = schema.safeParse(raw);
      return result as ContextReadResult<z.infer<TSchema>>;
    } catch {
      // JSON parse error or file read error — return failed parse
      const result = schema.safeParse({});
      return result as ContextReadResult<z.infer<TSchema>>;
    }
  };

  /**
   * Write a partial update to the context file.
   */
  const write = async (
    patch: Partial<Omit<z.infer<TSchema>, "context_version">>,
  ): Promise<void> => {
    let current: Record<string, unknown> = { context_version: 1 };

    try {
      const file = Bun.file(path);
      const exists = await file.exists();
      if (exists) {
        const raw = await file.json();
        if (raw && typeof raw === "object") {
          current = raw as Record<string, unknown>;
        }
      }
    } catch {
      // File doesn't exist or can't be read — start fresh
    }

    // Ensure context_version is always 1
    current.context_version = 1;

    // Deep merge the patch into current context
    const merged = merge({}, current, patch);

    const validated = schema.safeParse(merged);
    if (!validated.success) {
      throw new Error(`Schema validation failed: ${validated.error.message}`);
    }

    // Atomic write: write to temp file, chmod, then rename.
    // If the process crashes between write and rename, only the .tmp file
    // is affected — the original context file remains intact.
    const tmpPath = `${path}.tmp`;
    try {
      await Bun.write(tmpPath, JSON.stringify(validated.data, null, 2));

      // Restrict context files to owner read/write only.
      // Context files in /tmp contain workflow state and should not be
      // world-readable. Set permissions on temp file before atomic rename.
      try {
        await chmod(tmpPath, 0o600);
      } catch {
        // Non-critical: chmod may fail on certain platforms or file systems
      }

      await rename(tmpPath, path);
    } catch (err) {
      // Clean up temp file on failure
      try {
        await unlink(tmpPath);
      } catch {
        // Best-effort cleanup — temp file may not exist
      }
      throw err;
    }
  };

  return { read, write };
};
