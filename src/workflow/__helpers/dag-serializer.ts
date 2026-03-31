/**
 * Serialize/deserialize DAG execution state for checkpoint/resume.
 *
 * Uses the JSON state snapshot approach (borrowed from LangGraph):
 * - Save: serialize DAGCheckpoint to `.planning/checkpoints/{dagName}.json`
 * - Load: deserialize from JSON and validate via DAGCheckpointSchema.safeParse()
 * - Clear: remove checkpoint file after successful completion
 *
 * Uses Bun.write() for the write path per bun-preference rule.
 *
 * @see docs/architecture/dag-engine.md — DAG Serializer
 * @see docs/archive/runtime-research/research/dag-engines.md — Pattern #8 (JSON state snapshot)
 * @see docs/archive/runtime-research/research/risk-analysis.md — checkpointSchemaVersion pitfall
 */

import { DAGCheckpointSchema } from "../__schemas/workflow.schemas.ts";

import type { DAGCheckpoint } from "../__schemas/workflow.schemas.ts";
import { existsSync, mkdirSync, readFileSync, unlinkSync } from "node:fs";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default directory for checkpoint files. */
const DEFAULT_CHECKPOINT_BASE_PATH = ".planning/checkpoints";

/** Current checkpoint schema version. Increment when format changes. */
const CURRENT_CHECKPOINT_SCHEMA_VERSION = 1;

// ─── Save Checkpoint ─────────────────────────────────────────────────────────

/**
 * Persist a DAG checkpoint to disk as JSON.
 *
 * Creates the checkpoint directory if it does not exist.
 * Writes to `.planning/checkpoints/{dagName}.json` by default.
 *
 * @param checkpoint - The checkpoint data to persist
 * @param basePath - Directory for checkpoint files (defaults to ".planning/checkpoints")
 *
 * @example
 * ```typescript
 * saveCheckpoint({
 *   dagName: "phase-pipeline",
 *   dagVersion: "1.0.0",
 *   checkpointSchemaVersion: 1,
 *   startedAt: new Date().toISOString(),
 *   currentWave: 2,
 *   completedSteps: { classify: { complexity: "MODERATE" } },
 *   skippedSteps: [],
 *   failedSteps: {},
 *   context: {},
 * });
 * ```
 */
export function saveCheckpoint(
  checkpoint: DAGCheckpoint,
  basePath?: string,
): void {
  const dir = basePath ?? DEFAULT_CHECKPOINT_BASE_PATH;
  const filePath = `${dir}/${checkpoint.dagName}.json`;

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const json = JSON.stringify(checkpoint, null, 2);
  Bun.write(filePath, json);
}

// ─── Load Checkpoint ─────────────────────────────────────────────────────────

/**
 * Load a DAG checkpoint from disk.
 *
 * Reads from `.planning/checkpoints/{dagName}.json` and validates
 * via DAGCheckpointSchema.safeParse(). Returns null if:
 * - The file does not exist
 * - The file contains invalid JSON
 * - The checkpoint fails schema validation
 * - The checkpoint schema version is unsupported
 *
 * @param dagName - Name of the DAG to load checkpoint for
 * @param basePath - Directory for checkpoint files (defaults to ".planning/checkpoints")
 * @returns The validated DAGCheckpoint, or null if not found/invalid
 *
 * @example
 * ```typescript
 * const checkpoint = loadCheckpoint("phase-pipeline");
 * if (checkpoint) {
 *   console.log(`Resuming from wave ${checkpoint.currentWave}`);
 * }
 * ```
 */
export function loadCheckpoint(
  dagName: string,
  basePath?: string,
): DAGCheckpoint | null {
  const dir = basePath ?? DEFAULT_CHECKPOINT_BASE_PATH;
  const filePath = `${dir}/${dagName}.json`;

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const raw: unknown = JSON.parse(content);

    const parseResult = DAGCheckpointSchema.safeParse(raw);

    if (!parseResult.success) {
      console.warn(
        `[workflow] Checkpoint for "${dagName}" failed validation:`,
        parseResult.error.message,
      );
      return null;
    }

    // Check schema version compatibility
    if (
      parseResult.data.checkpointSchemaVersion >
      CURRENT_CHECKPOINT_SCHEMA_VERSION
    ) {
      console.warn(
        `[workflow] Checkpoint for "${dagName}" has schema version ${parseResult.data.checkpointSchemaVersion}, ` +
          `but this version of Luca supports up to ${CURRENT_CHECKPOINT_SCHEMA_VERSION}. Ignoring checkpoint.`,
      );
      return null;
    }

    return parseResult.data;
  } catch (err) {
    console.warn(
      `[workflow] Failed to load checkpoint for "${dagName}":`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

// ─── Clear Checkpoint ────────────────────────────────────────────────────────

/**
 * Remove a checkpoint file after successful DAG completion.
 *
 * Silently succeeds if the file does not exist.
 *
 * @param dagName - Name of the DAG to clear checkpoint for
 * @param basePath - Directory for checkpoint files (defaults to ".planning/checkpoints")
 *
 * @example
 * ```typescript
 * clearCheckpoint("phase-pipeline");
 * ```
 */
export function clearCheckpoint(dagName: string, basePath?: string): void {
  const dir = basePath ?? DEFAULT_CHECKPOINT_BASE_PATH;
  const filePath = `${dir}/${dagName}.json`;

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Silently ignore deletion failures
  }
}
