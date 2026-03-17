/**
 * State persistence layer for the Luca workflow state machine.
 *
 * Reads and writes workflow state to `.planning/state.json`.
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
import { sanitizeJsonParse } from "../utils/sanitize";
import { initializeContext } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for persisted state file */
export const STATE_FILE_PATH = ".planning/state.json";

// ─── Persistence Functions ──────────────────────────────────────────────────

/**
 * Persist an actor's snapshot to local JSON.
 *
 * Writes the snapshot to the local JSON file at `.planning/state.json`.
 *
 * @param actor - The running XState actor to persist
 * @param filePath - Path to the local JSON file
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

    await Bun.write(filePath, JSON.stringify(snapshot, null, 2));

    return { success: true, data: filePath };
  } catch (err) {
    return {
      success: false,
      error: `Failed to persist actor: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Load a previously persisted actor from local JSON.
 *
 * Reads the state snapshot from `.planning/state.json` and reconstructs
 * the XState actor. Re-reads `.planning/config.json` on every load so that
 * config-derived fields (gates, workflow_config, complexity_matrix,
 * lu_config) always reflect the current config — not a stale copy
 * frozen at initialization time.
 *
 * @param filePath - Path to the state file
 * @param configPath - Path to the config file (re-read on every load)
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
  configPath: string = ".planning/config.json",
): Promise<Result<Actor<typeof workflowMachine>>> {
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

    let snapshot: any;
    try {
      snapshot = sanitizeJsonParse(text);
      if (!snapshot.status) snapshot.status = "active";
      if (!snapshot.children) snapshot.children = {};
      if (!snapshot.historyValue) snapshot.historyValue = {};
    } catch {
      return {
        success: false,
        error: `State file contains invalid JSON: ${filePath}`,
      };
    }

    // Re-read config.json so config-derived fields (gates, workflow_config,
    // complexity_matrix, lu_config) reflect current config, not a
    // stale snapshot frozen at initialization time.
    let config: Record<string, unknown> = {};
    try {
      const configFile = Bun.file(configPath);
      if (await configFile.exists()) {
        config = await configFile.json();
      }
    } catch {
      // Invalid config JSON — proceed with empty config (persisted values used as fallback)
    }

    const context = initializeContext({
      ...((snapshot as any).context || {}),
      config,
    });
    const fullSnapshot = {
      ...(snapshot as any),
      context,
    } as Snapshot<unknown>;

    const actor = createActor(workflowMachine, {
      snapshot: fullSnapshot,
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

export async function createFreshActor(
  configPath: string = ".planning/config.json",
  overrides?: Partial<WorkflowMachineInput>,
): Promise<Result<Actor<typeof workflowMachine>>> {
  try {
    let config: Record<string, unknown> = {};

    // Read config from disk
    const configFile = Bun.file(configPath);
    if (await configFile.exists()) {
      try {
        config = await configFile.json();
      } catch {
        // Invalid config JSON -- proceed with defaults
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
 * Checks if the JSON file exists and is non-empty.
 *
 * @param filePath - Path to the state file
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
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return false;
    const text = await file.text();
    return text.trim().length > 0;
  } catch {
    return false;
  }
}
