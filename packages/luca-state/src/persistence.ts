/**
 * State persistence layer for the Luca workflow state machine.
 *
 * Provides functions to persist, load, and manage XState actor snapshots
 * in `.planning/state.json`. This enables session resume across CLI
 * invocations and agent restarts.
 *
 * Uses snake_case for all persisted JSON properties per API conventions.
 *
 * @module luca-state/persistence
 */
import { createActor } from "xstate";
import type { Actor, AnyActorRef, Snapshot } from "xstate";
import { unlinkSync } from "node:fs";
import { workflowMachine } from "./machine";
import type { WorkflowMachineInput } from "./machine";
import type { Result } from "./types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default path for persisted state file */
export const STATE_FILE_PATH = ".planning/state.json";

// ─── Persistence Functions ──────────────────────────────────────────────────

/**
 * Persist an actor's snapshot to the state file.
 *
 * Uses `actor.getPersistedSnapshot()` to obtain a JSON-serializable
 * representation of the actor's state, then writes it to disk.
 *
 * @param actor - The running XState actor to persist
 * @param filePath - Path to write the state file (default: STATE_FILE_PATH)
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
  actor: AnyActorRef,
  filePath: string = STATE_FILE_PATH,
): Promise<Result<string>> {
  try {
    const snapshot = actor.getPersistedSnapshot();
    const json = JSON.stringify(snapshot, null, 2);
    await Bun.write(filePath, json);
    return { success: true, data: filePath };
  } catch (err) {
    return {
      success: false,
      error: `Failed to persist actor: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Load a previously persisted actor from the state file.
 *
 * Reads the persisted snapshot from disk and creates a new actor
 * instance from it, allowing the workflow to resume from where it
 * left off.
 *
 * @param filePath - Path to the state file (default: STATE_FILE_PATH)
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
      snapshot = JSON.parse(text) as Snapshot<unknown>;
    } catch {
      return {
        success: false,
        error: `State file contains invalid JSON: ${filePath}`,
      };
    }

    const actor = createActor(workflowMachine, { snapshot });
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
 * Reads `.planning/config.json` (if available) to populate gates,
 * workflow_config, complexity_matrix, and autopilot_config. Falls back
 * to defaults if the config file is missing or invalid.
 *
 * @param configPath - Path to config.json (default: ".planning/config.json")
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
    let config: Record<string, any> = {};

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
    try {
      unlinkSync(filePath);
    } catch (err: any) {
      // ENOENT = file does not exist, which is fine (idempotent)
      if (err?.code !== "ENOENT") {
        throw err;
      }
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
 * Check whether a persisted state file exists and is non-empty.
 *
 * @param filePath - Path to the state file (default: STATE_FILE_PATH)
 * @returns true if the file exists and has content, false otherwise
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
