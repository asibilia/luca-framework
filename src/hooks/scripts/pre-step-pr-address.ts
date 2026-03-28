/**
 * pre-step-pr-address — Pre-step enforcement hook for pr-address sub-skills.
 *
 * Fires before Skill tool invocations during pr-address execution to verify
 * that the state machine is in the correct state before each sub-skill runs.
 * If the orchestrator attempts to call a sub-skill out of order, the hook
 * blocks the call.
 *
 * **Scope:** This hook is a proof-of-concept for the anti-skip enforcement
 * architecture. It validates pr-address sub-skill ordering specifically.
 * Phase 224 will generalize this pattern for all decomposed skills.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * **Guard:** Uses 200ms TTL via `guardPreStep` per PREMORTEM Constraint #2
 * from Phase 222 to prevent re-entrancy during parallel wave execution.
 *
 * @module pre-step-pr-address
 */

import { readFileSync } from "fs";

import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "../__helpers/hook-io.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Well-known path for the pr-address context file. */
const CONTEXT_PATH = "/tmp/pr-address-context.json";

/** pr-address sub-skill names that this hook enforces. */
const PR_ADDRESS_SUB_SKILLS = new Set([
  "pr-fetch",
  "pr-validate",
  "pr-debate",
  "pr-fix",
  "pr-learn",
  "pr-respond",
]);

/**
 * Maps each sub-skill name to the set of state machine states from which
 * it is valid to invoke that sub-skill.
 *
 * Derived from the pr-address state machine transitions:
 *   - pr-fetch: valid from `idle` (initial state)
 *   - pr-validate: valid from `fetched` (after FETCH_COMPLETE)
 *   - pr-debate: valid from `validated` (after VALIDATE_COMPLETE)
 *   - pr-fix: valid from `planned` or `validated` (after SKIP_DEBATE or PLAN_COMPLETE)
 *   - pr-learn: valid from `verified` (after VERIFY_COMPLETE)
 *   - pr-respond: valid from `verified` or `learned` or `responded`
 *     (after SKIP_LEARN or LEARN_COMPLETE or RESPOND_COMPLETE)
 *
 * Note: The orchestrator sends multiple events per sub-skill (e.g., pr-validate
 * sends CATEGORIZE_COMPLETE then VALIDATE_COMPLETE). The valid states listed
 * here represent the state BEFORE the sub-skill is invoked, not after.
 */
const VALID_STATES_FOR_SKILL: Record<string, ReadonlySet<string>> = {
  "pr-fetch": new Set(["idle"]),
  "pr-validate": new Set(["fetched"]),
  "pr-debate": new Set(["validated"]),
  "pr-fix": new Set(["planned", "debated"]),
  "pr-learn": new Set(["verified"]),
  "pr-respond": new Set(["verified", "learned", "responded"]),
};

// ─── Guard: ms-precision dedup ──────────────────────────────────────────────

const stdinData = await readStdinJson();
const toolName = (stdinData?.tool_name as string) || "unknown";

// Only act on Skill tool calls
if (toolName !== "Skill") {
  exitSuccess();
}

// PREMORTEM Constraint #2: 200ms TTL dedup guard
guardPreStep("pre-step-pr-address", toolName);

// ─── Main ───────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  // Extract skill name from tool_input
  const toolInput = stdinData?.tool_input as
    | Record<string, unknown>
    | undefined;
  const skillArg =
    (toolInput?.skill as string) || (toolInput?.args as string) || "";

  // Find which pr-address sub-skill is being called (if any)
  let matchedSkill: string | null = null;
  for (const name of PR_ADDRESS_SUB_SKILLS) {
    if (skillArg.includes(name)) {
      matchedSkill = name;
      break;
    }
  }

  // Not a pr-address sub-skill — allow
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
    // initial state (idle — pr-fetch hasn't run yet).
    if (typeof context.current_state === "string") {
      currentState = context.current_state;
    }
  } catch {
    // File doesn't exist or can't be read.
    // If pr-fetch is being called, that's valid (we start from idle).
    // For any other sub-skill, missing context = invalid state.
    if (matchedSkill !== "pr-fetch") {
      return exitBlock(
        `pr-address: cannot run ${matchedSkill} — context file not found at ${CONTEXT_PATH}. ` +
          `Has pr-fetch been run first?`,
      );
    }
    // pr-fetch from missing context = valid (initial state)
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
      `pr-address: cannot run ${matchedSkill} from state '${currentState}'. ` +
        `Valid states for ${matchedSkill}: [${[...validStates].join(", ")}].`,
    );
  }

  // State is valid — allow the sub-skill call
  return exitSuccess();
};

await main();
