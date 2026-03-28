/**
 * pre-step-milestone-complete — Pre-step enforcement hook for milestone-complete sub-skills.
 *
 * Fires before Skill tool invocations during milestone-complete execution to
 * verify that the state machine is in the correct state before each sub-skill
 * runs. If the orchestrator attempts to call a sub-skill out of order, the
 * hook blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * @module pre-step-milestone-complete
 * @see .planning/phases/224-anti-skip-rollout/01-PLAN.md Task 8
 */

import { readFileSync } from "fs";

import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "../__helpers/hook-io.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Well-known path for the milestone-complete context file. */
const CONTEXT_PATH = "/tmp/milestone-complete-context.json";

/** milestone-complete sub-skill names that this hook enforces. */
const SUB_SKILLS = new Set([
  "milestone-learn",
  "milestone-prune",
  "milestone-shadow-gate",
  "milestone-archive",
  "milestone-finalize",
]);

/**
 * Maps each sub-skill name to the set of state machine states from which
 * it is valid to invoke that sub-skill.
 *
 * Derived from the milestone-complete state machine transitions:
 *   - milestone-learn: valid from `idle` (initial state)
 *   - milestone-prune: valid from `learned` (after LEARN_COMPLETE)
 *   - milestone-shadow-gate: valid from `pruned` (after PRUNE_COMPLETE)
 *   - milestone-archive: valid from `scanned` (after SCAN_COMPLETE or SKIP_SCAN)
 *   - milestone-finalize: valid from `archived` (after ARCHIVE_COMPLETE)
 *
 * @see src/skills/__schemas/states/milestone-complete.states.ts
 */
const VALID_STATES_FOR_SKILL: Record<string, ReadonlySet<string>> = {
  "milestone-learn": new Set(["idle"]),
  "milestone-prune": new Set(["learned"]),
  "milestone-shadow-gate": new Set(["pruned"]),
  "milestone-archive": new Set(["scanned"]),
  "milestone-finalize": new Set(["archived"]),
};

// ─── Guard: ms-precision dedup ──────────────────────────────────────────────

const stdinData = await readStdinJson();
const toolName = (stdinData?.tool_name as string) || "unknown";

// Only act on Skill tool calls
if (toolName !== "Skill") {
  exitSuccess();
}

// PREMORTEM Constraint #2: 200ms TTL dedup guard
guardPreStep("pre-step-milestone-complete", toolName);

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Extract skill name from tool_input
  const toolInput = stdinData?.tool_input as
    | Record<string, unknown>
    | undefined;
  const skillArg =
    (toolInput?.skill as string) || (toolInput?.args as string) || "";

  // Find which milestone-complete sub-skill is being called (if any)
  let matchedSkill: string | null = null;
  for (const name of SUB_SKILLS) {
    if (skillArg.includes(name)) {
      matchedSkill = name;
      break;
    }
  }

  // Not a milestone-complete sub-skill — allow
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
    // initial state (idle — milestone-learn hasn't run yet).
    if (typeof context.current_state === "string") {
      currentState = context.current_state;
    }
  } catch {
    // File doesn't exist or can't be read.
    // If milestone-learn is being called, that's valid (we start from idle).
    // For any other sub-skill, missing context = invalid state.
    if (matchedSkill !== "milestone-learn") {
      return exitBlock(
        `milestone-complete: cannot run ${matchedSkill} — context file not found at ${CONTEXT_PATH}. ` +
          `Has milestone-learn been run first?`,
      );
    }
    // milestone-learn from missing context = valid (initial state)
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
      `milestone-complete: cannot run ${matchedSkill} from state '${currentState}'. ` +
        `Valid states for ${matchedSkill}: [${[...validStates].join(", ")}].`,
    );
  }

  // State is valid — allow the sub-skill call
  return exitSuccess();
};

await main();
