/**
 * pre-step-verify — Pre-step enforcement hook for verify sub-skills.
 *
 * Fires before Skill tool invocations during verify execution to
 * verify that the state machine is in the correct state before each
 * sub-skill runs. If the orchestrator attempts to call a sub-skill
 * out of order, the hook blocks the call.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * **Divergent paths:** After `tested`, either verify-diagnose (Path B: issues
 * found) or verify-review (Path A: no issues) may be called. Both are valid
 * from the `tested` state — the orchestrator decides which based on
 * `issues_found` in the context file.
 *
 * @module pre-step-verify
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 7
 */

import { readFileSync } from "fs";

import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "../__helpers/hook-io.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Well-known path for the verify context file. */
const CONTEXT_PATH = "/tmp/verify-context.json";

/** verify sub-skill names that this hook enforces. */
const SUB_SKILLS = new Set([
  "verify-extract",
  "verify-test",
  "verify-diagnose",
  "verify-review",
]);

/**
 * Maps each sub-skill name to the set of state machine states from which
 * it is valid to invoke that sub-skill.
 *
 * Derived from the verify state machine transitions:
 *   - verify-extract: valid from `idle` (initial state)
 *   - verify-test: valid from `extracted` (after EXTRACT_COMPLETE)
 *   - verify-diagnose: valid from `tested` (after TEST_COMPLETE, Path B)
 *   - verify-review: valid from `tested` (after TEST_COMPLETE, Path A)
 *
 * Note: Both verify-diagnose and verify-review are valid from `tested`.
 * The orchestrator decides which to call based on `issues_found` in the
 * context file. The hook only validates state, not path logic.
 *
 * @see src/skills/__schemas/states/verify.states.ts
 */
const VALID_STATES_FOR_SKILL: Record<string, ReadonlySet<string>> = {
  "verify-extract": new Set(["idle"]),
  "verify-test": new Set(["extracted"]),
  "verify-diagnose": new Set(["tested"]),
  "verify-review": new Set(["tested"]),
};

// ─── Guard: ms-precision dedup ──────────────────────────────────────────────

const stdinData = await readStdinJson();
const toolName = (stdinData?.tool_name as string) || "unknown";

// Only act on Skill tool calls
if (toolName !== "Skill") {
  exitSuccess();
}

// PREMORTEM Constraint #2: 200ms TTL dedup guard
guardPreStep("pre-step-verify", toolName);

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Extract skill name from tool_input
  const toolInput = stdinData?.tool_input as
    | Record<string, unknown>
    | undefined;
  const skillArg =
    (toolInput?.skill as string) || (toolInput?.args as string) || "";

  // Find which verify sub-skill is being called (if any)
  let matchedSkill: string | null = null;
  for (const name of SUB_SKILLS) {
    if (skillArg.includes(name)) {
      matchedSkill = name;
      break;
    }
  }

  // Not a verify sub-skill — allow
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
    // initial state (idle — verify-extract hasn't run yet).
    if (typeof context.current_state === "string") {
      currentState = context.current_state;
    }
  } catch {
    // File doesn't exist or can't be read.
    // If verify-extract is being called, that's valid (we start from idle).
    // For any other sub-skill, missing context = invalid state.
    if (matchedSkill !== "verify-extract") {
      return exitBlock(
        `verify: cannot run ${matchedSkill} — context file not found at ${CONTEXT_PATH}. ` +
          `Has verify-extract been run first?`,
      );
    }
    // verify-extract from missing context = valid (initial state)
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
      `verify: cannot run ${matchedSkill} from state '${currentState}'. ` +
        `Valid states for ${matchedSkill}: [${[...validStates].join(", ")}].`,
    );
  }

  // State is valid — allow the sub-skill call
  return exitSuccess();
};

await main();
