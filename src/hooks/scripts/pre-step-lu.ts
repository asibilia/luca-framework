/**
 * pre-step-lu — Pre-step enforcement hook for lu sub-skills.
 *
 * Fires before Skill tool invocations during lu execution to verify
 * that the state machine is in the correct state before each sub-skill runs.
 * If the orchestrator attempts to call a sub-skill out of order, the hook
 * blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * **Note:** lu-phase-loop is valid from both "scanned" (after SCAN_COMPLETE)
 * and "configured" (after SKIP_BACKLOG). The hook accepts both states.
 *
 * @module pre-step-lu
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 7
 */

import { readFileSync } from "fs";

import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "../__helpers/hook-io.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Well-known path for the lu context file. */
const CONTEXT_PATH = "/tmp/lu-context.json";

/** lu sub-skill names that this hook enforces. */
const LU_SUB_SKILLS = new Set([
  "lu-route",
  "lu-configure",
  "lu-backlog",
  "lu-phase-loop",
]);

/**
 * Maps each sub-skill name to the set of state machine states from which
 * it is valid to invoke that sub-skill.
 *
 * Derived from the lu state machine transitions:
 *   - lu-route: valid from `idle` (initial state)
 *   - lu-configure: valid from `routed` (after ROUTE_COMPLETE)
 *   - lu-backlog: valid from `configured` (after CONFIGURE_COMPLETE)
 *   - lu-phase-loop: valid from `scanned` (after SCAN_COMPLETE) or
 *     `configured` (after SKIP_BACKLOG — orchestrator skipped backlog)
 *
 * Note: The orchestrator writes `current_state` to the context file after
 * every state transition. The valid states listed here represent the state
 * BEFORE the sub-skill is invoked.
 */
const VALID_STATES_FOR_SKILL: Record<string, ReadonlySet<string>> = {
  "lu-route": new Set(["idle"]),
  "lu-configure": new Set(["routed"]),
  "lu-backlog": new Set(["configured"]),
  "lu-phase-loop": new Set(["scanned", "configured"]),
};

// ─── Guard: ms-precision dedup ──────────────────────────────────────────────

const stdinData = await readStdinJson();
const toolName = (stdinData?.tool_name as string) || "unknown";

// Only act on Skill tool calls
if (toolName !== "Skill") {
  exitSuccess();
}

// PREMORTEM Constraint #2: 200ms TTL dedup guard
guardPreStep("pre-step-lu", toolName);

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Extract skill name from tool_input
  const toolInput = stdinData?.tool_input as
    | Record<string, unknown>
    | undefined;
  const skillArg =
    (toolInput?.skill as string) || (toolInput?.args as string) || "";

  // Find which lu sub-skill is being called (if any)
  let matchedSkill: string | null = null;
  for (const name of LU_SUB_SKILLS) {
    if (skillArg.includes(name)) {
      matchedSkill = name;
      break;
    }
  }

  // Not a lu sub-skill — allow
  if (!matchedSkill) {
    return exitSuccess();
  }

  // Read the context file to determine current state
  let currentState = "idle"; // Default to idle if no context file yet
  try {
    const raw = readFileSync(CONTEXT_PATH, "utf-8");
    const context = JSON.parse(raw) as Record<string, unknown>;

    // The state is tracked by the orchestrator in the context file.
    // If the context file exists but has no state field, we're in the
    // initial state (idle — lu-route hasn't run yet).
    if (typeof context.current_state === "string") {
      currentState = context.current_state;
    }
  } catch {
    // File doesn't exist or can't be read.
    // If lu-route is being called, that's valid (we start from idle).
    // For any other sub-skill, missing context = invalid state.
    if (matchedSkill !== "lu-route") {
      return exitBlock(
        `lu: cannot run ${matchedSkill} — context file not found at ${CONTEXT_PATH}. ` +
          `Has lu-route been run first?`,
      );
    }
    // lu-route from missing context = valid (initial state)
    return exitSuccess();
  }

  // Validate that the state machine would accept this sub-skill call
  const validStates = VALID_STATES_FOR_SKILL[matchedSkill];
  if (!validStates) {
    // Unknown sub-skill (shouldn't happen, but fail open)
    return exitSuccess();
  }

  if (!validStates.has(currentState)) {
    return exitBlock(
      `lu: cannot run ${matchedSkill} from state '${currentState}'. ` +
        `Valid states for ${matchedSkill}: [${[...validStates].join(", ")}].`,
    );
  }

  // State is valid — allow the sub-skill call
  return exitSuccess();
};

await main();
