/**
 * Factory for creating pre-step enforcement hooks.
 *
 * Eliminates ~400 LOC of duplication across the 4 pre-step enforcement hooks
 * (pre-step-lu, pre-step-phase-execute, pre-step-verify,
 * pre-step-milestone-complete) by extracting the shared control flow into
 * a configurable factory function.
 *
 * Each hook defines:
 * - Which sub-skills it enforces
 * - Which states are valid for each sub-skill
 * - Where the context file lives
 * - Whether there's an initial skill valid from missing context
 *
 * The factory returns an async function that implements the full enforcement
 * protocol: stdin parsing, dedup guard, skill matching, context file reading,
 * and state validation.
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * @module enforcement-hook-factory
 * @see src/hooks/scripts/pre-step-lu.ts
 * @see src/hooks/scripts/pre-step-phase-execute.ts
 * @see src/hooks/scripts/pre-step-verify.ts
 * @see src/hooks/scripts/pre-step-milestone-complete.ts
 */

import { z } from "zod";

import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "./hook-io.ts";

// ─── Context File Schema ──────────────────────────────────────────────────

/**
 * Minimal Zod schema for context file validation in enforcement hooks.
 *
 * Only validates `current_state` — the single field used by enforcement logic.
 * Other context fields (outputs, metadata) are ignored via `passthrough()`.
 */
const EnforcementContextSchema = z
  .object({
    current_state: z.string().optional(),
  })
  .passthrough();

// ─── Config Interface ──────────────────────────────────────────────────────

/**
 * Configuration for a pre-step enforcement hook.
 *
 * Defines the hook identity, context file location, sub-skill registry,
 * valid state mapping, and optional initial skill.
 */
export interface EnforcementHookConfig {
  /**
   * Unique hook identifier used for dedup guard file naming.
   *
   * @example "pre-step-lu"
   */
  hookName: string;

  /**
   * Absolute path to the context JSON file written by the orchestrator.
   * The hook reads `current_state` from this file to determine whether
   * a sub-skill invocation is valid.
   *
   * @example "/tmp/lu-context.json"
   */
  contextPath: string;

  /**
   * Set of sub-skill names that this hook enforces.
   * Skill names not in this set are silently allowed (exit 0).
   *
   * @example new Set(["lu-route", "lu-configure", "lu-backlog", "lu-phase-loop"])
   */
  subSkills: ReadonlySet<string>;

  /**
   * Maps each sub-skill name to the set of state machine states from which
   * it is valid to invoke that sub-skill.
   *
   * The hook reads `current_state` from the context file and checks
   * whether it's in the corresponding set.
   *
   * @example { "lu-route": new Set(["idle"]), "lu-configure": new Set(["routed"]) }
   */
  validStates: Record<string, ReadonlySet<string>>;

  /**
   * Optional skill that is valid when the context file does not exist.
   *
   * When set, if the matched skill equals `initialSkill` and the context
   * file is missing, the hook exits success (fail-open for bootstrap).
   * This is the skill that creates the context file on first run.
   *
   * **WARNING: Fail-open exception.** When `initialSkill` is defined,
   * the hook allows that specific skill to run without any context file
   * validation. This is intentional for bootstrap scenarios where the
   * first sub-skill in the chain creates the context file. All other
   * sub-skills remain fail-closed on missing context.
   *
   * When `initialSkill` is `undefined`, the hook is **unconditionally
   * fail-closed** on missing context — no sub-skill is allowed to run
   * without a valid context file.
   *
   * @example "lu-route" — valid from missing context because it creates the file
   */
  initialSkill?: string;
}

// ─── Factory ───────────────────────────────────────────────────────────────

/**
 * Creates a pre-step enforcement hook function from configuration.
 *
 * The returned async function implements the full enforcement protocol:
 *
 * 1. Reads stdin via `readStdinJson()` from hook-io
 * 2. Exits success if `tool_name !== "Skill"`
 * 3. Calls `guardPreStep(hookName, toolName)` for 200ms TTL dedup
 * 4. Extracts skill name from `tool_input.skill` (exact) or first token of `tool_input.args`
 * 5. Exact set lookup against `subSkills` (no substring matching)
 * 6. If no match, exits success (not our sub-skill)
 * 7. Reads context file at `contextPath` via `Bun.file()` and validates with Zod `safeParse`
 * 8. On file-not-found:
 *    - If `initialSkill` is set AND matched skill === `initialSkill`,
 *      exits success (fail-open for bootstrap)
 *    - Otherwise, exits block with descriptive message (fail-closed)
 * 9. Validates `current_state` against `validStates[matchedSkill]`
 * 10. Exits success if valid, exits block if invalid
 *
 * @param config - Hook configuration defining sub-skills, states, and behavior
 * @returns An async function that executes the enforcement check
 *
 * @example
 * ```typescript
 * import { createSubSkillEnforcementHook } from "../__helpers/enforcement-hook-factory.ts";
 *
 * const hook = createSubSkillEnforcementHook({
 *   hookName: "pre-step-lu",
 *   contextPath: "/tmp/lu-context.json",
 *   subSkills: new Set(["lu-route", "lu-configure", "lu-backlog", "lu-phase-loop"]),
 *   validStates: {
 *     "lu-route": new Set(["idle"]),
 *     "lu-configure": new Set(["routed"]),
 *     "lu-backlog": new Set(["configured"]),
 *     "lu-phase-loop": new Set(["scanned", "configured"]),
 *   },
 *   initialSkill: "lu-route",
 * });
 *
 * await hook();
 * ```
 */
export const createSubSkillEnforcementHook = (
  config: EnforcementHookConfig,
): (() => Promise<void>) => {
  const { hookName, contextPath, subSkills, validStates, initialSkill } =
    config;

  return async (): Promise<void> => {
    // Step 1: Read stdin
    const stdinData = await readStdinJson();
    const toolName = (stdinData?.tool_name as string) || "unknown";

    // Step 2: Only act on Skill tool calls
    if (toolName !== "Skill") {
      return exitSuccess();
    }

    // Step 3: PREMORTEM Constraint #2: 200ms TTL dedup guard
    guardPreStep(hookName, toolName);

    // Step 4: Extract skill name from tool_input (exact match)
    // `tool_input.skill` contains the exact skill name. If absent,
    // fall back to the first whitespace-delimited token from `tool_input.args`.
    const toolInput = stdinData?.tool_input as
      | Record<string, unknown>
      | undefined;
    const skillName =
      (toolInput?.skill as string) ||
      ((toolInput?.args as string) || "").split(/\s+/)[0];

    // Step 5: Exact set lookup — no substring matching
    if (!skillName || !subSkills.has(skillName)) {
      // Not our sub-skill — allow
      return exitSuccess();
    }
    const matchedSkill = skillName;

    // Step 7: Read the context file via Bun.file and validate with Zod
    let currentState = "idle"; // Default to idle if no context file yet
    try {
      const file = Bun.file(contextPath);
      const exists = await file.exists();

      if (!exists) {
        // Step 8a: File doesn't exist.
        if (initialSkill && matchedSkill === initialSkill) {
          // initialSkill from missing context = valid (bootstrap scenario)
          return exitSuccess();
        }
        // All other sub-skills: missing context = invalid state (fail-closed)
        return exitBlock(
          `${hookName}: cannot run ${matchedSkill} — context file not found at ${contextPath}. ` +
            `Has ${initialSkill || "the orchestrator"} been run first?`,
        );
      }

      const raw = await file.json();
      const parseResult = EnforcementContextSchema.safeParse(raw);

      if (!parseResult.success) {
        // Context file exists but failed schema validation — fail-closed
        return exitBlock(
          `${hookName}: context file at ${contextPath} failed validation. ` +
            `Errors: ${parseResult.error.message}`,
        );
      }

      // The state is tracked by the orchestrator in the context file.
      // If the context file exists but has no state field, we're in the
      // initial state (idle — first sub-skill hasn't run yet).
      if (parseResult.data.current_state) {
        currentState = parseResult.data.current_state;
      }
    } catch {
      // Step 8b: File can't be read (permissions, corrupted JSON, etc.)
      if (initialSkill && matchedSkill === initialSkill) {
        return exitSuccess();
      }
      return exitBlock(
        `${hookName}: cannot run ${matchedSkill} — context file not readable at ${contextPath}. ` +
          `Has ${initialSkill || "the orchestrator"} been run first?`,
      );
    }

    // Step 9: Validate that the state machine would accept this sub-skill call
    const validStatesForSkill = validStates[matchedSkill];
    if (!validStatesForSkill) {
      // Unknown sub-skill (shouldn't happen, but fail open)
      return exitSuccess();
    }

    if (!validStatesForSkill.has(currentState)) {
      return exitBlock(
        `${hookName}: cannot run ${matchedSkill} from state '${currentState}'. ` +
          `Valid states for ${matchedSkill}: [${[...validStatesForSkill].join(", ")}].`,
      );
    }

    // Step 10: State is valid — allow the sub-skill call
    return exitSuccess();
  };
};
