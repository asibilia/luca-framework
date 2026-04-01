/**
 * Deterministic crash recovery algorithm.
 *
 * Reads the pipeline lock file, state.json, and convergence state to
 * produce a RecoveryAction JSON that tells the orchestrator exactly
 * where to resume. Zero LLM involvement — pure data-driven logic.
 *
 * Decision tree:
 *   1. No lock file             -> fresh_start
 *   2. Lock stale (dead PID)
 *      a. state = idle          -> fresh_start
 *      b. pipeline_step present -> restart_step at that step
 *      c. phase_step = commit   -> advance_phase
 *   3. Lock stale (>24h)        -> fresh_start with warning
 *   4. Lock live                -> report conflict (another session running)
 *
 * CLI usage:
 *   bun packages/luca-framework/src/recovery/__helpers/recover.ts
 *
 * @module luca-recovery/recover
 */
import { checkLockStatus, readLock } from "../../state/__helpers/pipeline-lock";
import { stateExists, loadPersistedActor } from "../../state/persistence";
import { resolveStateValue } from "../../state/__helpers/resolve-state-value";
import { readConvergenceState } from "./convergence-state";
import { recoveryActionSchema } from "../__schemas/recovery.schemas";

import type { RecoveryAction } from "../__schemas/recovery.schemas";
import type { PipelineLock } from "../../state/__schemas/pipeline-lock.schemas";

// ─── Pipeline Step Mapping ──────────────────────────────────────────────────

/**
 * Map pipeline_step values from the lock file to lu.skill.ts step names.
 *
 * The lock file stores coarse step names; the orchestrator uses numbered
 * steps. This mapping bridges the two.
 */
const STEP_MAP: Record<string, string> = {
  init: "step-1",
  preflight: "step-2",
  classify: "step-2",
  route: "step-2",
  "phase-loop": "step-7",
  discuss: "step-7",
  plan: "step-7",
  execute: "step-7",
  harness: "step-7i",
  verify: "step-7j",
  review: "step-7k",
  learn: "step-8",
  commit: "step-9",
  complete: "step-10",
};

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Determine the recovery action from current system state.
 *
 * Reads lock file, state.json, and convergence state to make a
 * deterministic decision about where to resume. Never calls an LLM.
 *
 * @returns RecoveryAction JSON with the resume point and context
 *
 * @example
 * ```typescript
 * const action = await determineRecoveryAction();
 * // { action: "restart_step", step: "step-7", phase_id: 266, briefing: "...", convergence_state: null }
 * ```
 */
export async function determineRecoveryAction(): Promise<RecoveryAction> {
  // 1. Check lock status
  const lockStatus = await checkLockStatus();
  const lock = await readLock();

  // 2. Read convergence state (may be null)
  const convergenceState = await readConvergenceState();

  // Case 1: No lock file — clean start
  if (lockStatus.status === "clear" || !lock) {
    return buildAction("fresh_start", "No lock file found. Starting fresh.");
  }

  // Case 2: Live lock — another session is active
  if (lockStatus.status === "live") {
    return buildAction(
      "fresh_start",
      `Live session detected: PID ${lock.pid}, session ${lock.session_id}. ` +
        `Cannot recover while another session is running. ${lockStatus.reason ?? ""}`,
    );
  }

  // Case 3: Stale lock — crashed session, determine resume point
  if (lockStatus.status === "stale") {
    return determineResumeFromStaleLock(lock, convergenceState);
  }

  // Fallback: unknown status — fresh start
  return buildAction(
    "fresh_start",
    `Unknown lock status: ${lockStatus.status}. Starting fresh.`,
  );
}

/**
 * Determine resume point from a stale (crashed) lock file.
 *
 * Reads state.json to understand workflow state, then combines with
 * lock file step info to decide where to resume.
 *
 * @param lock - The stale pipeline lock contents
 * @param convergenceState - Persisted convergence state (may be null)
 * @returns RecoveryAction with the resume point
 */
async function determineResumeFromStaleLock(
  lock: PipelineLock,
  convergenceState: RecoveryAction["convergence_state"],
): Promise<RecoveryAction> {
  // Read workflow state from state.json
  const workflowState = await readWorkflowState();
  const pipelineStep = lock.pipeline_step;
  const phaseStep = lock.phase_step;
  const phaseId = lock.phase_id;

  // Stale lock + idle state -> fresh start
  if (workflowState === "idle") {
    return buildAction(
      "fresh_start",
      `Stale lock with idle workflow state. PID ${lock.pid} crashed before meaningful progress. Starting fresh.`,
    );
  }

  // Phase step is "commit" -> the phase completed, advance to next
  if (phaseStep === "commit" || phaseStep === "complete") {
    return buildAction(
      "advance_phase",
      `Phase ${phaseId ?? "unknown"} was at "${phaseStep}" step when session crashed. ` +
        `Phase work appears complete. Advancing to next phase.`,
      mapStep(pipelineStep),
      phaseId,
      convergenceState,
    );
  }

  // Pipeline step indicates mid-execution -> restart at that step
  if (pipelineStep && pipelineStep !== "init") {
    const step = mapStep(pipelineStep);

    // If we have convergence state for the same phase, include it
    const relevantConvergence =
      convergenceState && convergenceState.phase_id === phaseId
        ? convergenceState
        : null;

    return buildAction(
      phaseId !== undefined ? "resume_phase" : "restart_step",
      `Crashed during pipeline step "${pipelineStep}"` +
        (phaseStep ? ` (phase step: "${phaseStep}")` : "") +
        (phaseId !== undefined ? ` in phase ${phaseId}` : "") +
        `. Resuming at ${step}.` +
        (relevantConvergence
          ? ` Convergence state recovered: loop ${relevantConvergence.loop_index}/${relevantConvergence.max_iterations}, ` +
            `${relevantConvergence.error_ledger.length} errors logged.`
          : ""),
      step,
      phaseId,
      relevantConvergence,
    );
  }

  // Lock exists but pipeline_step is "init" — barely started
  return buildAction(
    "fresh_start",
    `Stale lock at init step. PID ${lock.pid} crashed during initialization. Starting fresh.`,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read the current workflow state from state.json.
 *
 * Returns the top-level state name (e.g., "idle", "executing", "complete")
 * or "idle" if state cannot be read.
 */
async function readWorkflowState(): Promise<string> {
  try {
    if (!(await stateExists())) return "idle";
    const result = await loadPersistedActor();
    if (!result.success) return "idle";
    return resolveStateValue(result.data.getSnapshot().value);
  } catch {
    return "idle";
  }
}

/**
 * Map a lock file pipeline_step to an orchestrator step name.
 *
 * @param pipelineStep - The pipeline_step value from the lock file
 * @returns The corresponding lu.skill.ts step name
 */
function mapStep(pipelineStep: string): string {
  return STEP_MAP[pipelineStep] ?? "step-7";
}

/**
 * Build a validated RecoveryAction object.
 *
 * Uses safeParse for validation — if the action fails validation,
 * falls back to a fresh_start action.
 *
 * @param action - The recovery action type
 * @param briefing - Human-readable explanation of the decision
 * @param step - Optional pipeline step to resume at
 * @param phaseId - Optional phase ID to resume
 * @param convergenceState - Optional convergence state context
 * @returns Validated RecoveryAction
 */
function buildAction(
  action: RecoveryAction["action"],
  briefing: string,
  step?: string,
  phaseId?: number,
  convergenceState?: RecoveryAction["convergence_state"],
): RecoveryAction {
  const raw = {
    action,
    briefing,
    step,
    phase_id: phaseId,
    convergence_state: convergenceState ?? null,
  };

  const result = recoveryActionSchema.safeParse(raw);
  if (result.success) return result.data;

  // Fallback: return a minimal fresh_start action
  return {
    action: "fresh_start",
    briefing: `Recovery action validation failed: ${result.error.message}. Starting fresh.`,
    convergence_state: null,
  };
}

// ─── CLI Entry Point ──────────────────────────────────────────────────────────

if (import.meta.main) {
  determineRecoveryAction()
    .then((action) => {
      console.log(JSON.stringify(action, null, 2));
    })
    .catch((err) => {
      console.error(
        "Recovery failed:",
        err instanceof Error ? err.message : String(err),
      );
      // Even on error, output a valid fresh_start action
      console.log(
        JSON.stringify({
          action: "fresh_start",
          briefing: `Recovery error: ${err instanceof Error ? err.message : String(err)}. Starting fresh.`,
          convergence_state: null,
        }),
      );
      process.exit(1);
    });
}
