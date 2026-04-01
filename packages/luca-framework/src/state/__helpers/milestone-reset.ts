/**
 * Cross-milestone state reset module.
 *
 * Provides functions to validate milestone readiness, perform a full
 * state reset while preserving session identity, and track milestone
 * count across a session.
 *
 * Used by the `luca-bridge milestone-reset` subcommand and the
 * orchestrator (lu.skill.ts Step 9) for cross-milestone continuation.
 *
 * All functions use the Result<T> pattern and never throw.
 *
 * @module luca-state/milestone-reset
 */
import { truncate, access, constants } from "node:fs/promises";
import { resolve } from "node:path";

import filter from "lodash/filter";
import get from "lodash/get";
import cloneDeep from "lodash/cloneDeep";

import {
  MAX_MILESTONES_PER_SESSION,
  milestoneResetResultSchema,
  milestoneReadinessSchema,
} from "../__schemas/milestone-reset.schemas";
import { acquireLock, releaseLock } from "./pipeline-lock";
import { initializeContext } from "../types";
import { sanitizeJsonParse } from "../../utils/sanitize";
import { STATE_FILE_PATH } from "../persistence";

import type {
  MilestoneResetResult,
  MilestoneReadiness,
} from "../__schemas/milestone-reset.schemas";
import type { PhaseResult, Result } from "../types";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Path to the routing history JSONL file */
const ROUTING_HISTORY_PATH = resolve(
  process.cwd(),
  ".planning/routing-history.jsonl",
);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Check if a file exists on disk.
 *
 * @param path - Absolute or cwd-relative file path
 * @returns true if the file is accessible, false otherwise
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Validate whether the pipeline is ready for cross-milestone continuation.
 *
 * Checks two conditions:
 * 1. All phases in the current milestone passed (no failed or blocked)
 * 2. The milestone count has not exceeded MAX_MILESTONES_PER_SESSION
 *
 * @param phaseResults - Array of phase results from the current milestone
 * @param milestoneCount - Current milestone count in this session
 * @returns Result with MilestoneReadiness on success
 *
 * @example
 * ```typescript
 * const readiness = validateMilestoneReadiness(phaseResults, 1);
 * if (readiness.success && readiness.data.ready) {
 *   // Safe to proceed with milestone reset
 * }
 * ```
 */
export function validateMilestoneReadiness(
  phaseResults: PhaseResult[],
  milestoneCount: number,
): Result<MilestoneReadiness> {
  // Check milestone count limit
  if (milestoneCount >= MAX_MILESTONES_PER_SESSION) {
    const parsed = milestoneReadinessSchema.safeParse({
      ready: false,
      reason: `Milestone count (${milestoneCount}) has reached the session limit of ${MAX_MILESTONES_PER_SESSION}`,
      milestone_count: milestoneCount,
      max_milestones: MAX_MILESTONES_PER_SESSION,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: `Readiness validation failed: ${parsed.error.message}`,
      };
    }
    return { success: true, data: parsed.data };
  }

  // Check for failed or blocked phases
  const failedPhases = filter(
    phaseResults,
    (pr) => pr.status === "failed" || pr.status === "blocked",
  );

  if (failedPhases.length > 0) {
    const failedIds = failedPhases
      .map((pr) => `Phase ${pr.phase_id} (${pr.status})`)
      .join(", ");
    const parsed = milestoneReadinessSchema.safeParse({
      ready: false,
      reason: `Cannot continue: ${failedIds}`,
      milestone_count: milestoneCount,
      max_milestones: MAX_MILESTONES_PER_SESSION,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: `Readiness validation failed: ${parsed.error.message}`,
      };
    }
    return { success: true, data: parsed.data };
  }

  // All checks passed
  const parsed = milestoneReadinessSchema.safeParse({
    ready: true,
    milestone_count: milestoneCount,
    max_milestones: MAX_MILESTONES_PER_SESSION,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: `Readiness validation failed: ${parsed.error.message}`,
    };
  }
  return { success: true, data: parsed.data };
}

/**
 * Perform a full state reset for cross-milestone continuation.
 *
 * Executes the following steps atomically:
 * 1. Release the pipeline lock
 * 2. Clear routing history (truncate JSONL file)
 * 3. Read state.json, preserve session_id and git_workflow, clear everything else
 * 4. Re-initialize context with preserved fields
 * 5. Write cleaned state.json
 * 6. Re-acquire the pipeline lock
 *
 * @param opts - Options specifying which fields to preserve across the reset
 * @param opts.session_id - Session ID to preserve (required)
 * @param opts.git_workflow - Git workflow context to preserve (optional)
 * @returns Result with MilestoneResetResult on success
 *
 * @example
 * ```typescript
 * const result = await resetForNextMilestone({
 *   session_id: "abc-123",
 *   git_workflow: { branch: "main", base_branch: "main" },
 * });
 * if (result.success) {
 *   console.log(`Reset complete at ${result.data.reset_at}`);
 * }
 * ```
 */
export async function resetForNextMilestone(opts: {
  session_id: string;
  git_workflow?: Record<string, unknown>;
}): Promise<Result<MilestoneResetResult>> {
  try {
    // Step 1: Release the pipeline lock
    const releaseResult = await releaseLock();
    if (!releaseResult.success) {
      return {
        success: false,
        error: `Lock release failed: ${releaseResult.error}`,
      };
    }

    // Step 2: Clear routing history
    let routingHistoryCleared = false;
    if (await fileExists(ROUTING_HISTORY_PATH)) {
      await truncate(ROUTING_HISTORY_PATH, 0);
      routingHistoryCleared = true;
    }

    // Step 3: Read current state to get the milestone name before clearing
    let archivedMilestone: string | undefined;
    const stateFile = Bun.file(STATE_FILE_PATH);
    if (await stateFile.exists()) {
      try {
        const raw = sanitizeJsonParse(await stateFile.text()) as Record<
          string,
          unknown
        >;
        const ctx = raw.context as Record<string, unknown> | undefined;
        if (ctx) {
          archivedMilestone = get(ctx, "current_milestone") as
            | string
            | undefined;
        }
      } catch {
        // If state is corrupt, proceed with reset anyway
      }
    }

    // Step 4: Re-initialize context with preserved fields only
    // This clears all execution state (phase_results, complexity, etc.)
    // while keeping session continuity
    const freshContext = initializeContext({
      session_id: opts.session_id,
      git_workflow: opts.git_workflow as ReturnType<
        typeof initializeContext
      >["git_workflow"],
      milestone_count: 0, // Will be incremented by incrementMilestoneCount()
    });

    // Step 5: Write cleaned state.json
    // Reconstruct a minimal XState-compatible snapshot with fresh context
    const freshSnapshot = {
      status: "active",
      value: "idle",
      historyValue: {},
      context: freshContext,
      children: {},
    };
    await Bun.write(STATE_FILE_PATH, JSON.stringify(freshSnapshot, null, 2));

    // Step 6: Re-acquire the pipeline lock
    let lockReacquired = false;
    const acquireResult = await acquireLock(
      opts.session_id,
      "milestone-reset",
      "init",
    );
    if (acquireResult.success) {
      lockReacquired = true;
    }
    // Non-fatal: if lock acquisition fails, the session can still continue
    // (the orchestrator will re-acquire on next step)

    const resetParsed = milestoneResetResultSchema.safeParse({
      session_id: opts.session_id,
      git_workflow_preserved: opts.git_workflow !== undefined,
      routing_history_cleared: routingHistoryCleared,
      lock_reacquired: lockReacquired,
      archived_milestone: archivedMilestone,
      reset_at: new Date().toISOString(),
    });

    if (!resetParsed.success) {
      return {
        success: false,
        error: `Milestone reset validation failed: ${resetParsed.error.message}`,
      };
    }

    return { success: true, data: resetParsed.data };
  } catch (err) {
    return {
      success: false,
      error: `Milestone reset failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Increment the milestone count in state.json and persist.
 *
 * Reads the current milestone_count from state.json context,
 * increments it by one, and writes back to disk.
 *
 * @returns Result with the new milestone count on success
 *
 * @example
 * ```typescript
 * const result = await incrementMilestoneCount();
 * if (result.success) {
 *   console.log(`Now on milestone ${result.data}`);
 * }
 * ```
 */
export async function incrementMilestoneCount(): Promise<Result<number>> {
  try {
    const stateFile = Bun.file(STATE_FILE_PATH);
    if (!(await stateFile.exists())) {
      return { success: false, error: "State file not found" };
    }

    const raw = sanitizeJsonParse(await stateFile.text()) as Record<
      string,
      unknown
    >;
    const ctx = raw.context as Record<string, unknown> | undefined;
    if (!ctx) {
      return { success: false, error: "State file has no context" };
    }

    const currentCount = (get(ctx, "milestone_count") as number) ?? 0;
    const newCount = currentCount + 1;

    // Update context with new count
    const updatedContext = cloneDeep(ctx);
    (updatedContext as Record<string, unknown>).milestone_count = newCount;
    (updatedContext as Record<string, unknown>).last_transition_at =
      new Date().toISOString();

    const updatedState = { ...raw, context: updatedContext };
    await Bun.write(STATE_FILE_PATH, JSON.stringify(updatedState, null, 2));

    return { success: true, data: newCount };
  } catch (err) {
    return {
      success: false,
      error: `Failed to increment milestone count: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
