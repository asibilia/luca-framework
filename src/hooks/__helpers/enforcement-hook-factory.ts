/**
 * Factory for creating pre-step enforcement hooks.
 *
 * Eliminates ~400 LOC of duplication across the 5 pre-step enforcement hooks
 * (pre-step-lu, pre-step-phase-execute, pre-step-verify,
 * pre-step-milestone-complete, pre-step-pr-address) by extracting the shared
 * control flow into a configurable factory function.
 *
 * Each hook defines:
 * - Which sub-skills/agents it enforces
 * - Which states are valid for each sub-skill/agent
 * - Where the context file lives
 * - Whether there's an initial skill/agent valid from missing context
 *
 * The factory returns an async function that implements the full enforcement
 * protocol: stdin parsing, dedup guard, skill/agent matching, context file
 * reading, and state validation.
 *
 * Supports both `Skill()` and `Agent()` tool calls:
 * - Skill: matches via `tool_input.skill` (exact set lookup)
 * - Agent: matches via `tool_input.subagent_type` or `tool_input.name`
 *   (exact set lookup OR prefix-based matching for dynamic agent names)
 *
 * **Layer 3** of the anti-skip enforcement architecture (pre-step enforcement).
 *
 * @module enforcement-hook-factory
 * @see src/hooks/scripts/pre-step-lu.ts
 * @see src/hooks/scripts/pre-step-phase-execute.ts
 * @see src/hooks/scripts/pre-step-verify.ts
 * @see src/hooks/scripts/pre-step-milestone-complete.ts
 * @see src/hooks/scripts/pre-step-pr-address.ts
 */

import { z } from "zod";

import {
  readStdinJson,
  exitSuccess,
  exitBlock,
  guardPreStep,
} from "./hook-io.ts";

import { computePipelinePosition } from "../../../packages/luca-framework/src/state/__helpers/pipeline-position";
import { HookContextSchema } from "../../workflow/__helpers/contract-hook-adapter";

// ─── Stdin Payload Schema ────────────────────────────────────────────────

const StdinPayloadSchema = z
  .object({
    tool_name: z.string().default("unknown"),
    tool_input: z
      .object({
        skill: z.string().optional(),
        args: z.string().optional(),
        subagent_type: z.string().optional(),
        name: z.string().optional(),
      })
      .passthrough()
      .optional(),
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
   * Set of sub-skill/agent names that this hook enforces via exact match.
   * Names not matched by `subSkills` or `agentPrefixes` are silently allowed (exit 0).
   *
   * @example new Set(["cognition", "configure", "backlog", "milestone-learn"])
   */
  subSkills: ReadonlySet<string>;

  /**
   * Optional set of agent name prefixes for matching dynamic Agent() names.
   *
   * Entries ending with `-` are treated as prefixes: `"execute-"` matches
   * `"execute-230"`, `"execute-231"`, etc. Entries without a trailing `-`
   * are treated as exact matches (same as `subSkills`).
   *
   * When an Agent() call is detected, matching tries `subSkills` (exact)
   * first, then `agentPrefixes` (prefix or exact).
   *
   * @example new Set(["classify-", "execute-", "harness-", "review-", "milestone-learn"])
   */
  agentPrefixes?: ReadonlySet<string>;

  /**
   * Maps each sub-skill/agent name (or prefix) to the set of state machine
   * states from which it is valid to invoke that step.
   *
   * The hook reads `current_state` from the context file and checks
   * whether it's in the corresponding set.
   *
   * For prefix-based matching, use the prefix as the key (e.g., `"execute-"`).
   * The lookup tries exact match first, then prefix match.
   *
   * @example { "cognition": new Set(["idle"]), "execute-": new Set(["planned"]) }
   */
  validStates: Record<string, ReadonlySet<string>>;

  /**
   * Optional skill/agent that is valid when the context file does not exist.
   *
   * When set, if the matched step equals `initialSkill` and the context
   * file is missing, the hook exits success (fail-open for bootstrap).
   * This is the step that creates the context file on first run.
   *
   * **WARNING: Fail-open exception.** When `initialSkill` is defined,
   * the hook allows that specific step to run without any context file
   * validation. This is intentional for bootstrap scenarios where the
   * first step in the chain creates the context file. All other
   * steps remain fail-closed on missing context.
   *
   * @example "cognition" — valid from missing context because it creates the file
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
 * 2. Exits success if `tool_name` is not `"Skill"` or `"Agent"`
 * 3. Calls `guardPreStep(hookName, toolName)` for 200ms TTL dedup
 * 4. Extracts step name:
 *    - For Skill: `tool_input.skill` or first token of `tool_input.args`
 *    - For Agent: `tool_input.subagent_type` or `tool_input.name`
 * 5. Matches against `subSkills` (exact) then `agentPrefixes` (prefix or exact)
 * 6. If no match, exits success (not our step)
 * 7. Reads context file at `contextPath` via `Bun.file()` and validates with Zod `safeParse`
 * 8. On file-not-found:
 *    - If `initialSkill` is set AND matched step === `initialSkill`,
 *      exits success (fail-open for bootstrap)
 *    - Otherwise, exits block with descriptive message (fail-closed)
 * 9. Validates `current_state` against `validStates[matchedStep]` (exact then prefix lookup)
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
 *   subSkills: new Set(["cognition", "configure", "backlog"]),
 *   agentPrefixes: new Set(["classify-", "execute-", "verify-", "review-"]),
 *   validStates: {
 *     "cognition": new Set(["idle"]),
 *     "configure": new Set(["routed"]),
 *     "backlog": new Set(["configured"]),
 *     "classify-": new Set(["idle", "executing"]),
 *     "execute-": new Set(["executing"]),
 *   },
 *   initialSkill: "cognition",
 * });
 *
 * await hook();
 * ```
 */
export const createSubSkillEnforcementHook = (
  config: EnforcementHookConfig,
): (() => Promise<void>) => {
  const {
    hookName,
    contextPath,
    subSkills,
    agentPrefixes,
    validStates,
    initialSkill,
  } = config;

  return async (): Promise<void> => {
    // Step 1: Read stdin and validate via Zod schema
    const stdinRaw = await readStdinJson();
    const stdinResult = StdinPayloadSchema.safeParse(stdinRaw ?? {});
    const stdinData = stdinResult.success
      ? stdinResult.data
      : StdinPayloadSchema.parse({});
    const toolName = stdinData.tool_name;

    // Step 2: Only act on Skill or Agent tool calls
    if (toolName !== "Skill" && toolName !== "Agent") {
      return exitSuccess();
    }

    // Step 3: PREMORTEM Constraint #2: 200ms TTL dedup guard
    guardPreStep(hookName, toolName);

    // Step 4: Extract step name from tool_input
    const toolInput = stdinData.tool_input;

    let stepName: string;
    if (toolName === "Skill") {
      // Skill: `tool_input.skill` or first token of `tool_input.args`
      stepName =
        toolInput?.skill ?? (toolInput?.args ?? "").split(/\s+/)[0] ?? "";
    } else {
      // Agent: `tool_input.subagent_type` or `tool_input.name`
      stepName = toolInput?.subagent_type ?? toolInput?.name ?? "";
    }

    // Step 5: Match against subSkills (exact) then agentPrefixes (prefix or exact)
    const matchResult = matchStep(stepName, subSkills, agentPrefixes);
    if (!matchResult) {
      // Not our step — allow
      return exitSuccess();
    }
    const { matchedStep, matchKey } = matchResult;

    // Step 7: Read the context file via Bun.file and validate with Zod
    let currentState = "idle"; // Default to idle if no context file yet
    try {
      const file = Bun.file(contextPath);
      const exists = await file.exists();

      if (!exists) {
        // Step 8a: File doesn't exist.
        if (initialSkill && matchedStep === initialSkill) {
          // initialSkill from missing context = valid (bootstrap scenario)
          return exitSuccess();
        }
        // All other steps: missing context = invalid state (fail-closed)
        return exitBlock(
          `${hookName}: cannot run ${matchedStep} — context file not found at ${contextPath}. ` +
            `Has ${initialSkill || "the orchestrator"} been run first?`,
        );
      }

      const raw = await file.json();
      const parseResult = HookContextSchema.safeParse(raw);

      if (!parseResult.success) {
        // Context file exists but failed schema validation — fail-closed
        return exitBlock(
          `${hookName}: context file at ${contextPath} failed validation. ` +
            `Errors: ${parseResult.error.message}`,
        );
      }

      // The state is tracked by the orchestrator in the context file.
      // If the context file exists but has no state field, we're in the
      // initial state (idle — first step hasn't run yet).
      if (contextPath.endsWith("state.json")) {
        // lu gate: derive pipeline position from XState value field
        const stateValue = String(
          (raw as Record<string, unknown>).value ?? "idle",
        );
        currentState = computePipelinePosition(stateValue);
      } else if (parseResult.data.current_state) {
        currentState = parseResult.data.current_state;
      }
    } catch {
      // Step 8b: File can't be read (permissions, corrupted JSON, etc.)
      if (initialSkill && matchedStep === initialSkill) {
        return exitSuccess();
      }
      return exitBlock(
        `${hookName}: cannot run ${matchedStep} — context file not readable at ${contextPath}. ` +
          `Has ${initialSkill || "the orchestrator"} been run first?`,
      );
    }

    // Step 9: Validate state — try exact match on matchedStep, then matchKey (prefix)
    const validStatesForStep =
      validStates[matchedStep] || validStates[matchKey];
    if (!validStatesForStep) {
      // Step matched subSkills/agentPrefixes but has no validStates entry — fail-closed
      return exitBlock(
        `${hookName}: step ${matchedStep} is registered but has no valid states configured. ` +
          `Add a validStates entry for "${matchKey}" in the hook config.`,
      );
    }

    if (!validStatesForStep.has(currentState)) {
      return exitBlock(
        `${hookName}: cannot run ${matchedStep} from state '${currentState}'. ` +
          `Valid states for ${matchedStep}: [${[...validStatesForStep].join(", ")}].`,
      );
    }

    // Step 10: State is valid — allow the step call
    return exitSuccess();
  };
};

// ─── Matching Helpers ─────────────────────────────────────────────────────

/**
 * Match a step name against exact sub-skill names and prefix-based agent names.
 *
 * Tries exact match via `subSkills` first, then checks `agentPrefixes` for
 * prefix matches (entries ending with `-`) or additional exact matches.
 *
 * @returns `{ matchedStep, matchKey }` where `matchedStep` is the full step name
 *          and `matchKey` is the key to use for `validStates` lookup (either the
 *          exact name or the matching prefix). Returns `null` if no match.
 */
const matchStep = (
  stepName: string,
  subSkills: ReadonlySet<string>,
  agentPrefixes?: ReadonlySet<string>,
): { matchedStep: string; matchKey: string } | null => {
  if (!stepName) return null;

  // Exact match against subSkills
  if (subSkills.has(stepName)) {
    return { matchedStep: stepName, matchKey: stepName };
  }

  // Prefix or exact match against agentPrefixes
  if (agentPrefixes) {
    for (const prefix of agentPrefixes) {
      if (prefix.endsWith("-")) {
        // Prefix match: "execute-" matches "execute-230"
        if (stepName.startsWith(prefix)) {
          return { matchedStep: stepName, matchKey: prefix };
        }
      } else {
        // Exact match via agentPrefixes (for entries without trailing -)
        if (stepName === prefix) {
          return { matchedStep: stepName, matchKey: stepName };
        }
      }
    }
  }

  return null;
};
