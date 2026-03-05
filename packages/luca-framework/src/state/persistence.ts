/**
 * State persistence layer for the Luca workflow state machine.
 *
 * SpacetimeDB-primary: reads query SpacetimeDB first, falls back to
 * `.planning/state.json`. Writes go to SpacetimeDB reducers; optional
 * STATE.md generation is gated by `LUCA_EXPORT_MD=true`.
 *
 * Uses snake_case for all persisted JSON properties per API conventions.
 *
 * @module luca-state/persistence
 */
import { createActor } from "xstate";
import type { Actor, Snapshot } from "xstate";
import { workflowMachine } from "./machine";
import type { WorkflowMachineInput } from "./machine";
import type { Result } from "./types";
import { sanitizeJsonParse } from "./sanitize";
import { queryOne } from "./__helpers/spacetimedb-client";
import { callReducer } from "./__helpers/observer-emitter";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for persisted state file */
export const STATE_FILE_PATH = ".planning/state.json";

// ─── Persistence Functions ──────────────────────────────────────────────────

/**
 * Persist an actor's snapshot to SpacetimeDB.
 *
 * Calls the `update_workflow_state` reducer with the actor's persisted
 * snapshot. STATE.md generation is gated by LUCA_EXPORT_MD env var.
 *
 * @param actor - The running XState actor to persist
 * @param filePath - Unused (kept for backward compatibility signature)
 * @returns Result with the file path on success, or error message on failure
 *
 * @example
 * ```typescript
 * const actor = createActor(workflowMachine);
 * actor.start();
 * actor.send({ type: "START", ticket_id: "PROJ-1" });
 * const result = await persistActor(actor);
 * // { success: true, data: ".planning/state.json" }
 * ```
 */
export async function persistActor(
  actor: { getPersistedSnapshot: () => unknown; getSnapshot: () => any },
  filePath: string = STATE_FILE_PATH,
): Promise<Result<string>> {
  try {
    const snapshot = actor.getPersistedSnapshot();
    const snap = actor.getSnapshot();

    // Primary: write to SpacetimeDB via reducer
    callReducer("update_workflow_state", {
      workflowState: String(snap.value),
      currentPhase: snap.context.current_phase ?? "",
      complexity: snap.context.complexity ?? "TRIVIAL",
      oversight: snap.context.oversight ?? "milestone",
      sessionId: snap.context.session_id ?? "",
      ticketId: snap.context.ticket_id ?? "",
      contextJson: JSON.stringify(snap.context),
    });

    return { success: true, data: filePath };
  } catch (err) {
    return {
      success: false,
      error: `Failed to persist actor: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Load a previously persisted actor.
 *
 * SpacetimeDB-primary: queries workflow_state for the context JSON,
 * then reconstructs the actor. Falls back to reading .planning/state.json.
 *
 * @param filePath - Path to the state file (fallback)
 * @returns Result with the restored actor on success, or error message on failure
 *
 * @example
 * ```typescript
 * const result = await loadPersistedActor();
 * if (result.success) {
 *   const snapshot = result.data.getSnapshot();
 *   console.log(snapshot.value); // e.g., "executing"
 * }
 * ```
 */
export async function loadPersistedActor(
  filePath: string = STATE_FILE_PATH,
): Promise<Result<Actor<typeof workflowMachine>>> {
  // Primary: try SpacetimeDB
  try {
    const row = await queryOne<{ contextJson: string }>(
      "SELECT * FROM workflow_state WHERE id = 1",
    );
    if (row && row.contextJson) {
      const snapshot = sanitizeJsonParse(row.contextJson) as Snapshot<unknown>;
      const actor = createActor(workflowMachine, {
        snapshot,
      } as Parameters<typeof createActor<typeof workflowMachine>>[1]);
      actor.start();
      return { success: true, data: actor };
    }
  } catch {
    // SpacetimeDB unavailable — fall through to JSON file
  }

  // Fallback: read from JSON file
  try {
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return {
        success: false,
        error: `State file not found: ${filePath}`,
      };
    }

    const text = await file.text();
    if (!text.trim()) {
      return {
        success: false,
        error: `State file is empty: ${filePath}`,
      };
    }

    let snapshot: Snapshot<unknown>;
    try {
      snapshot = sanitizeJsonParse(text) as Snapshot<unknown>;
    } catch {
      return {
        success: false,
        error: `State file contains invalid JSON: ${filePath}`,
      };
    }

    // Cast needed: persisted snapshot is parsed from JSON as Snapshot<unknown>,
    // but createActor expects the machine's specific snapshot type.
    const actor = createActor(workflowMachine, {
      snapshot,
    } as Parameters<typeof createActor<typeof workflowMachine>>[1]);
    actor.start();
    return { success: true, data: actor };
  } catch (err) {
    return {
      success: false,
      error: `Failed to load persisted actor: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Create a fresh actor from config.json and optional context overrides.
 *
 * SpacetimeDB-primary: queries workflow_config for configuration,
 * falls back to reading .planning/config.json from disk.
 *
 * @param configPath - Path to config.json (fallback)
 * @param overrides - Optional partial context overrides
 * @returns Result with the new actor on success, or error message on failure
 *
 * @example
 * ```typescript
 * const result = await createFreshActor();
 * if (result.success) {
 *   const actor = result.data;
 *   actor.send({ type: "START", ticket_id: "PROJ-1" });
 * }
 * ```
 */
export async function createFreshActor(
  configPath: string = ".planning/config.json",
  overrides?: Partial<WorkflowMachineInput>,
): Promise<Result<Actor<typeof workflowMachine>>> {
  try {
    let config: Record<string, unknown> = {};

    // Primary: try SpacetimeDB for config
    try {
      const row = await queryOne<{ configJson: string }>(
        "SELECT * FROM workflow_config WHERE id = 1",
      );
      if (row && row.configJson) {
        config = JSON.parse(row.configJson);
      }
    } catch {
      // SpacetimeDB unavailable — fall through to file
    }

    // Fallback: read config from disk if SpacetimeDB didn't provide it
    if (Object.keys(config).length === 0) {
      const configFile = Bun.file(configPath);
      if (await configFile.exists()) {
        try {
          config = await configFile.json();
        } catch {
          // Invalid config JSON -- proceed with defaults
        }
      }
    }

    const input: WorkflowMachineInput = {
      config,
      ...overrides,
    };

    const actor = createActor(workflowMachine, { input });
    actor.start();
    return { success: true, data: actor };
  } catch (err) {
    return {
      success: false,
      error: `Failed to create fresh actor: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Clear the persisted state file.
 *
 * Removes `.planning/state.json` from disk. Idempotent -- does not
 * error if the file does not exist.
 *
 * @param filePath - Path to the state file (default: STATE_FILE_PATH)
 * @returns Result with void on success, or error message on failure
 *
 * @example
 * ```typescript
 * const result = await clearPersistedState();
 * // { success: true, data: undefined }
 * ```
 */
export async function clearPersistedState(
  filePath: string = STATE_FILE_PATH,
): Promise<Result<void>> {
  try {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      const { unlink } = await import("node:fs/promises");
      await unlink(filePath);
    }
    return { success: true, data: undefined };
  } catch (err) {
    return {
      success: false,
      error: `Failed to clear persisted state: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Check whether persisted state exists.
 *
 * SpacetimeDB-primary: queries for a row count. Falls back to
 * checking if the JSON file exists and is non-empty.
 *
 * @param filePath - Path to the state file (fallback)
 * @returns true if state exists, false otherwise
 *
 * @example
 * ```typescript
 * if (await stateExists()) {
 *   console.log("Persisted state available for resume");
 * }
 * ```
 */
export async function stateExists(
  filePath: string = STATE_FILE_PATH,
): Promise<boolean> {
  // Primary: try SpacetimeDB
  try {
    const row = await queryOne<{ cnt: number }>(
      "SELECT COUNT(*) as cnt FROM workflow_state",
    );
    if (row && row.cnt > 0) return true;
  } catch {
    // SpacetimeDB unavailable — fall through
  }

  // Fallback: check JSON file
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return false;
    const text = await file.text();
    return text.trim().length > 0;
  } catch {
    return false;
  }
}
