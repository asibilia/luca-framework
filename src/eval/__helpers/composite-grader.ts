import type {
  GraderResult,
  CompositeGraderConfig,
  CompositeGraderEntry,
  LlmAdapter,
  CustomGraderFn,
} from "../__schemas/eval.schemas";
import { gradeWithCode } from "./code-grader";
import { makeFailResult } from "./grader-utils";
import { gradeWithLlm } from "./llm-grader";

/**
 * Grade a single entry within a composite grader.
 *
 * Dispatches to the appropriate grader based on entry type.
 * Nested composite graders are not supported.
 *
 * @param entry - The composite grader entry to evaluate
 * @param output - Raw output from the agent
 * @param expected - Expected output record
 * @param defaultJudgeModel - Fallback judge model for LLM entries
 * @param adapter - LLM adapter (required for LLM entries)
 * @param customFn - Optional custom grader function for code entries
 * @returns GraderResult from the sub-grader
 */
async function gradeEntry(
  entry: CompositeGraderEntry,
  output: unknown,
  expected: Record<string, unknown> | undefined,
  defaultJudgeModel: string,
  adapter: LlmAdapter | null,
  customFn?: CustomGraderFn,
): Promise<GraderResult> {
  switch (entry.type) {
    case "code": {
      if (!entry.code_config) {
        return makeFailResult("Code grader config missing for code entry");
      }
      return gradeWithCode(output, entry.code_config, customFn);
    }

    case "llm": {
      if (!adapter) {
        return makeFailResult("LLM adapter required for LLM grading");
      }
      if (!entry.llm_config) {
        return makeFailResult("LLM grader config missing for LLM entry");
      }
      return gradeWithLlm(
        output,
        expected,
        entry.llm_config,
        defaultJudgeModel,
        adapter,
      );
    }

    case "composite": {
      return makeFailResult("Nested composite graders not supported");
    }

    default: {
      return makeFailResult(`Unknown grader type: ${entry.type}`);
    }
  }
}

/**
 * Grade an eval case using a weighted composite of multiple graders.
 *
 * Runs all grader entries, computes a weighted score, and determines
 * pass/fail based on the pass_threshold.
 *
 * @param output - Raw output from the agent being evaluated
 * @param expected - Expected output record (passed to sub-graders)
 * @param config - Composite grader config with entries and pass threshold
 * @param defaultJudgeModel - Fallback judge model for any LLM sub-graders
 * @param adapter - LLM adapter for LLM sub-graders (can be null if no LLM entries)
 * @param caseId - Eval case ID used to look up the correct custom grader function
 * @param customFns - Map of custom grader functions keyed by eval case ID or strategy name
 * @returns GraderResult with weighted score and per-grader breakdown in metadata
 *
 * @example
 * ```typescript
 * const result = await gradeWithComposite(
 *   output,
 *   expected,
 *   {
 *     graders: [
 *       { type: "code", weight: 0.6, code_config: { strategy: "set_membership", allowed_values: ["gap-1", "gap-2"] } },
 *       { type: "llm", weight: 0.4, llm_config: { rubric: "Was the explanation clear?" } },
 *     ],
 *     pass_threshold: 0.7,
 *   },
 *   "claude-haiku-4-5-20250514",
 *   adapter,
 * );
 * ```
 */
export async function gradeWithComposite(
  output: unknown,
  expected: Record<string, unknown> | undefined,
  config: CompositeGraderConfig,
  defaultJudgeModel: string,
  adapter: LlmAdapter | null,
  caseId: string,
  customFns?: Map<string, CustomGraderFn>,
): Promise<GraderResult> {
  const perGrader: Array<{
    type: string;
    weight: number;
    score: number;
    passed: boolean;
  }> = [];

  let weightedScore = 0;

  for (const entry of config.graders) {
    // Resolve custom function if needed
    const customFn = customFns?.get(caseId);

    const result = await gradeEntry(
      entry,
      output,
      expected,
      defaultJudgeModel,
      adapter,
      entry.type === "code" ? customFn : undefined,
    );

    weightedScore += entry.weight * result.score;
    perGrader.push({
      type: entry.type,
      weight: entry.weight,
      score: result.score,
      passed: result.passed,
    });
  }

  const passed = weightedScore >= config.pass_threshold;
  const scoreDescriptions = perGrader
    .map((g) => `${g.type}(w=${g.weight}): ${g.score.toFixed(2)}`)
    .join(", ");

  return {
    passed,
    score: weightedScore,
    reason: `Composite score ${weightedScore.toFixed(3)} (threshold ${config.pass_threshold}): ${scoreDescriptions}`,
    metadata: {
      per_grader: perGrader,
    },
  };
}
