/**
 * pre-step-phase-execute — Pre-step enforcement hook for phase-execute sub-skills.
 *
 * Fires before Skill tool invocations during phase-execute execution to verify
 * that the state machine is in the correct state before each sub-skill runs.
 * If the orchestrator attempts to call a sub-skill out of order, the hook
 * blocks the call.
 *
 * **Scope:** Validates ordering of the 3 phase-execute sub-skills:
 * phase-execute-waves, phase-execute-verify, phase-execute-review.
 * Setup and learning/commit steps are handled by the orchestrator directly
 * (not sub-skills), so this hook only enforces the 3 extracted loop sub-skills.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * @module pre-step-phase-execute
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 6
 */

import { readFileSync } from "fs";

import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "../__helpers/hook-io.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Well-known path for the phase-execute context file. */
const CONTEXT_PATH = "/tmp/phase-execute-context.json";

/** phase-execute sub-skill names that this hook enforces. */
const SUB_SKILLS = new Set([
  "phase-execute-waves",
  "phase-execute-verify",
  "phase-execute-review",
]);

/**
 * Maps each sub-skill name to the set of state machine states from which
 * it is valid to invoke that sub-skill.
 *
 * Derived from the phase-execute state machine transitions:
 *   - phase-execute-waves: valid from `setup` (after SETUP_COMPLETE)
 *   - phase-execute-verify: valid from `executed` (after WAVES_COMPLETE)
 *   - phase-execute-review: valid from `verified` (after VERIFY_COMPLETE)
 *
 * Note: Setup (Steps 0-0.6) and learning/commit (Step 9+) are handled by the
 * orchestrator directly — they are not sub-skills and are not enforced here.
 *
 * @see src/skills/__schemas/states/phase-execute.states.ts
 */
const VALID_STATES_FOR_SKILL: Record<string, ReadonlySet<string>> = {
  "phase-execute-waves": new Set(["setup"]),
  "phase-execute-verify": new Set(["executed"]),
  "phase-execute-review": new Set(["verified"]),
};

// ─── Guard: ms-precision dedup ──────────────────────────────────────────────

const stdinData = await readStdinJson();
const toolName = (stdinData?.tool_name as string) || "unknown";

// Only act on Skill tool calls
if (toolName !== "Skill") {
  exitSuccess();
}

// PREMORTEM Constraint #2: 200ms TTL dedup guard
guardPreStep("pre-step-phase-execute", toolName);

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Extract skill name from tool_input
  const toolInput = stdinData?.tool_input as
    | Record<string, unknown>
    | undefined;
  const skillArg =
    (toolInput?.skill as string) || (toolInput?.args as string) || "";

  // Find which phase-execute sub-skill is being called (if any)
  let matchedSkill: string | null = null;
  for (const name of SUB_SKILLS) {
    if (skillArg.includes(name)) {
      matchedSkill = name;
      break;
    }
  }

  // Not a phase-execute sub-skill — allow
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
    // initial state (idle — setup hasn't completed yet).
    if (typeof context.current_state === "string") {
      currentState = context.current_state;
    }
  } catch {
    // File doesn't exist or can't be read.
    // For phase-execute sub-skills, missing context = invalid state.
    // The orchestrator must initialize the context file during setup
    // before any sub-skill is invoked.
    return exitBlock(
      `phase-execute: cannot run ${matchedSkill} — context file not found at ${CONTEXT_PATH}. ` +
        `Has the orchestrator completed setup?`,
    );
  }

  // Validate that the state machine would accept this sub-skill call
  const validStates = VALID_STATES_FOR_SKILL[matchedSkill];
  if (!validStates) {
    // Unknown sub-skill (shouldn't happen, but fail open)
    return exitSuccess();
  }

  if (!validStates.has(currentState)) {
    return exitBlock(
      `phase-execute: cannot run ${matchedSkill} from state '${currentState}'. ` +
        `Valid states for ${matchedSkill}: [${[...validStates].join(", ")}].`,
    );
  }

  // State is valid — allow the sub-skill call
  return exitSuccess();
};

await main();
