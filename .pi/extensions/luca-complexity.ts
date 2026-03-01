/**
 * Luca Complexity Gating Extension for Pi
 *
 * Exposes task complexity classification and workflow step gating to
 * Pi's LLM. Reads complexity from STATE.md, provides gating decisions
 * for workflow steps, and allows complexity overrides.
 *
 * Source: src/hooks/pi-extensions/luca-complexity.ts
 * Deployed to: .pi/extensions/luca-complexity.ts
 */
import { COMPLEXITY_LEVELS } from "./__helpers/luca-constants";
import type { ComplexityLevel } from "./__helpers/luca-constants";
import type { PiExtensionAPI } from "./__types/pi-context";

import { createJsonResponse, createTextResponse } from "./__helpers/response";
import {
  readComplexity as bridgeReadComplexity,
  writeComplexity as bridgeWriteComplexity,
} from "./__helpers/state-bridge";
import { COMPLEXITY_TIERS } from "./__helpers/status";

/** Gating matrix: which workflow steps activate at which level. */
const GATING_MATRIX: Record<
  ComplexityLevel,
  Record<string, string | number>
> = {
  TRIVIAL: {
    cognitive_preflight: "lite",
    research: "skip",
    discussion: "skip",
    plan_verification_iterations: 0,
    harness_fix_iterations: 1,
    verify_fix_iterations: 0,
    verification_mode: "quick",
    code_review: "skip",
    uat: "skip",
    learning_capture: "skip",
  },
  SIMPLE: {
    cognitive_preflight: "lite",
    research: "skip",
    discussion: "skip",
    plan_verification_iterations: 0,
    harness_fix_iterations: 2,
    verify_fix_iterations: 1,
    verification_mode: "quick",
    code_review: "skip",
    uat: "skip",
    learning_capture: "brief",
  },
  MODERATE: {
    cognitive_preflight: "full",
    research: "optional",
    discussion: "optional",
    plan_verification_iterations: 1,
    harness_fix_iterations: 3,
    verify_fix_iterations: 1,
    verification_mode: "standard",
    code_review: "run",
    uat: "optional",
    learning_capture: "standard",
  },
  COMPLEX: {
    cognitive_preflight: "full",
    research: "required",
    discussion: "run",
    plan_verification_iterations: 2,
    harness_fix_iterations: 3,
    verify_fix_iterations: 2,
    verification_mode: "full",
    code_review: "run",
    uat: "required",
    learning_capture: "full",
  },
  CRITICAL: {
    cognitive_preflight: "full",
    research: "required",
    discussion: "required",
    plan_verification_iterations: 3,
    harness_fix_iterations: 5,
    verify_fix_iterations: 3,
    verification_mode: "full+human",
    code_review: "run",
    uat: "required+thorough",
    learning_capture: "full+debrief",
  },
};

/**
 * Pi extension: Complexity gating and tier management.
 *
 * Registers tools for reading/setting task complexity levels (TRIVIAL
 * through CRITICAL) and checking workflow step gates against the
 * complexity matrix in .planning/config.json.
 *
 * @param pi - Pi ExtensionAPI instance
 */
export default function lucaComplexity(pi: PiExtensionAPI) {
  const cwd = process.cwd();

  /**
   * Read current complexity level via state bridge.
   *
   * Primary: reads from state.json context.complexity
   * Fallback: parses STATE.md Task Complexity field
   * Default: "MODERATE" if both sources unavailable
   *
   * @returns The current complexity level (defaults to "MODERATE")
   */
  function readComplexity(): ComplexityLevel {
    const level = bridgeReadComplexity(cwd).toUpperCase();
    if (COMPLEXITY_LEVELS.includes(level as ComplexityLevel)) {
      return level as ComplexityLevel;
    }
    return "MODERATE";
  }

  // Tool: Read current complexity
  pi.registerTool({
    name: "luca_read_complexity",
    label: "Read Task Complexity",
    description:
      "Read the current task complexity level (TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL) and its behavioral tier (lightweight, standard, thorough).",
    parameters: {},
    async execute() {
      const level = readComplexity();
      const tier = COMPLEXITY_TIERS[level];
      return createJsonResponse({ level, tier });
    },
  });

  // Tool: Set complexity level
  pi.registerTool({
    name: "luca_set_complexity",
    label: "Set Task Complexity",
    description:
      "Set the task complexity level in STATE.md. Valid levels: TRIVIAL, SIMPLE, MODERATE, COMPLEX, CRITICAL.",
    parameters: {
      type: "object",
      properties: {
        level: {
          type: "string",
          description:
            "Complexity level: TRIVIAL, SIMPLE, MODERATE, COMPLEX, or CRITICAL",
        },
      },
      required: ["level"],
    },
    async execute(_toolCallId: string, params: { level: string }) {
      const level = params.level.toUpperCase();
      if (!COMPLEXITY_LEVELS.includes(level as ComplexityLevel)) {
        return createTextResponse(
          `Invalid level "${params.level}". Valid: ${COMPLEXITY_LEVELS.join(", ")}`,
        );
      }

      // Write via state bridge (state.json + STATE.md snapshot)
      const result = await bridgeWriteComplexity(cwd, level);

      if (!result.success) {
        return createTextResponse(`Error: ${result.error}`);
      }

      const tier = COMPLEXITY_TIERS[level as ComplexityLevel];
      return createTextResponse(`Complexity set to ${level} (${tier} tier)`);
    },
  });

  // Tool: Get gating decision for a workflow step
  pi.registerTool({
    name: "luca_gate_check",
    label: "Check Complexity Gate",
    description:
      "Check whether a workflow step should run at the current complexity level. Returns the gating decision (skip, optional, run, required) and the full gating matrix for the current level.",
    parameters: {
      type: "object",
      properties: {
        step: {
          type: "string",
          description:
            "Workflow step to check: cognitive_preflight, research, discussion, plan_verification_iterations, harness_fix_iterations, verify_fix_iterations, verification_mode, code_review, uat, learning_capture",
        },
      },
    },
    async execute(_toolCallId: string, params: { step?: string }) {
      const level = readComplexity();
      const gate = GATING_MATRIX[level];

      if (params.step) {
        const decision = gate[params.step];
        if (decision === undefined) {
          return createTextResponse(
            `Unknown step "${params.step}". Valid: ${Object.keys(gate).join(", ")}`,
          );
        }
        return createJsonResponse({
          level,
          step: params.step,
          decision,
          tier: COMPLEXITY_TIERS[level],
        });
      }

      // Return full matrix for current level
      return createJsonResponse({
        level,
        tier: COMPLEXITY_TIERS[level],
        gates: gate,
      });
    },
  });
}
