---
title: "Runtime C02: Eval graders (code, LLM, composite)"
area: eval
created: 2026-03-24
source: docs/runtime-architecture/research/agent-evaluation.md
depends_on: [C01]
phase: runtime-c
estimated_files: 3
---

## Context

Implement three grader types that score eval case outputs. All graders return `GraderResult` (from C01 schemas). No classes -- use factory functions and pure functions per project conventions.

## Files to Create

### 1. `src/eval/__helpers/code-grader.ts`

Deterministic graders with zero LLM cost. Each strategy is a pure function.

````typescript
import get from "lodash/get";

import type { GraderResult, CodeGraderConfig } from "../__schemas/eval.schemas";

/**
 * Type for user-provided custom grading functions.
 *
 * Receives the extracted output value and the full expected record.
 * Must return a GraderResult synchronously.
 *
 * @param output - The value extracted from the agent output (via output_path or full output)
 * @param expected - The full expected record from the eval case
 * @returns GraderResult with passed, score, reason, and optional metadata
 */
export type CustomGraderFn = (
  output: unknown,
  expected: Record<string, unknown> | undefined,
) => GraderResult;

/**
 * Grade an eval case output using a deterministic code-based strategy.
 *
 * Extracts the value to grade using `config.output_path` (via lodash get)
 * or uses the raw output if no path is specified. Then applies the
 * configured strategy.
 *
 * @param output - Raw output from the agent/component being evaluated
 * @param config - Code grader configuration specifying strategy and parameters
 * @param customFn - Optional custom grading function (required when strategy is "custom")
 * @returns GraderResult with pass/fail, score, reason, and metadata
 *
 * @example
 * ```typescript
 * const result = gradeWithCode(
 *   { complexity: "MODERATE" },
 *   { strategy: "exact_match", expected_value: "MODERATE", output_path: "complexity" },
 * );
 * // { passed: true, score: 1.0, reason: "Exact match: ...", metadata: {} }
 * ```
 */
export function gradeWithCode(
  output: unknown,
  config: CodeGraderConfig,
  customFn?: CustomGraderFn,
): GraderResult {
  /* implementation */
}
````

**Strategy implementations (all inside `gradeWithCode` or as private helper functions):**

1. **`exact_match`**: Compare extracted value with `config.expected_value` using `JSON.stringify` for deep equality. Score is 1.0 on match, 0.0 on mismatch.

2. **`contains`**: Check that `String(extractedValue)` includes every string in `config.expected_substrings`. Score is `(matched_count / total_count)`. Passes when score is 1.0.

3. **`regex`**: Test `String(extractedValue)` against `new RegExp(config.pattern)`. Score is 1.0 on match, 0.0 on no match.

4. **`set_membership`**: Check if extracted value is in `config.allowed_values` using `JSON.stringify` comparison. Score is 1.0 if member, 0.0 if not. Reason includes the allowed set for debugging.

5. **`threshold`**: Extract numeric value. Check `config.min <= value <= config.max` (either bound optional). Score is 1.0 if within range, 0.0 if outside. If value is not a number, score 0.0 with reason "Output is not a number".

6. **`custom`**: Call `customFn(extractedValue, expected)`. If `customFn` is undefined, return score 0.0 with reason "No custom grading function provided".

**Value extraction**: If `config.output_path` is set, use `get(output, config.output_path)` from lodash. Otherwise use `output` directly.

### 2. `src/eval/__helpers/llm-grader.ts`

LLM-as-judge grader using the Anthropic API.

````typescript
import type { GraderResult, LlmGraderConfig } from "../__schemas/eval.schemas";

/**
 * Adapter interface for making LLM calls.
 *
 * Abstracted so the eval runner can inject a mock adapter for testing
 * or a real Anthropic API adapter for production runs.
 */
export interface LlmAdapter {
  /**
   * Send a message to an LLM and get a text response.
   *
   * @param model - Model identifier (e.g., "claude-haiku-4-5-20250514")
   * @param systemPrompt - System prompt for the judge
   * @param userMessage - User message containing the eval context
   * @param temperature - Sampling temperature (0.0 for deterministic)
   * @returns Object with text response and token usage
   */
  call(
    model: string,
    systemPrompt: string,
    userMessage: string,
    temperature: number,
  ): Promise<{
    text: string;
    input_tokens: number;
    output_tokens: number;
  }>;
}

/**
 * Grade an eval case output using an LLM as judge.
 *
 * Sends the agent output and rubric to a judge model, which returns
 * a structured score with reasoning. The judge prompt instructs the
 * model to respond with a JSON object: { score: number, passed: boolean, reasoning: string }.
 *
 * @param output - Raw output from the agent being evaluated
 * @param expected - Expected output (provided for context, not for matching)
 * @param config - LLM grader config (rubric, judge_model override, temperature)
 * @param defaultJudgeModel - Fallback judge model from suite config
 * @param adapter - LLM adapter for making API calls
 * @returns GraderResult with score, pass/fail, and judge reasoning
 *
 * @example
 * ```typescript
 * const result = await gradeWithLlm(
 *   agentOutput,
 *   expectedOutput,
 *   { rubric: "Score 1.0 if all gaps are identified with clear explanations..." },
 *   "claude-haiku-4-5-20250514",
 *   anthropicAdapter,
 * );
 * ```
 */
export async function gradeWithLlm(
  output: unknown,
  expected: Record<string, unknown> | undefined,
  config: LlmGraderConfig,
  defaultJudgeModel: string,
  adapter: LlmAdapter,
): Promise<GraderResult> {
  /* implementation */
}
````

**Judge system prompt** (exact text to use):

```
You are an expert evaluator scoring AI agent outputs.

You will receive:
1. The agent's output
2. The expected output (if available)
3. A rubric describing the scoring criteria

Score the output from 0.0 to 1.0 based on the rubric.

Respond with ONLY a JSON object in this exact format:
{
  "score": <number between 0.0 and 1.0>,
  "passed": <true if score >= 0.7, false otherwise>,
  "reasoning": "<1-3 sentences explaining the score>"
}
```

**Judge user message format**:

```
## Agent Output
{JSON.stringify(output, null, 2)}

## Expected Output
{JSON.stringify(expected, null, 2) or "Not provided"}

## Rubric
{config.rubric}
```

**Error handling**: If the adapter call fails or the response is not valid JSON, return `{ passed: false, score: 0.0, reason: "Judge call failed: {error}", metadata: { error: true } }`.

**Parsing**: Use `JSON.parse` on the judge response text. If parsing fails, try to extract score from text with regex `/"score"\s*:\s*([\d.]+)/`. If that fails too, return score 0.0 with the raw text as reason.

### 3. `src/eval/__helpers/composite-grader.ts`

Combines multiple graders with configurable weights.

````typescript
import type {
  GraderResult,
  CompositeGraderConfig,
  CompositeGraderEntry,
} from "../__schemas/eval.schemas";
import { gradeWithCode } from "./code-grader";
import { gradeWithLlm } from "./llm-grader";
import type { LlmAdapter } from "./llm-grader";
import type { CustomGraderFn } from "./code-grader";

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
  customFns?: Map<string, CustomGraderFn>,
): Promise<GraderResult> {
  /* implementation */
}
````

**Implementation logic:**

1. Iterate through `config.graders` entries.
2. For each entry:
   - If `entry.type === "code"`: call `gradeWithCode(output, entry.code_config!, customFn)`.
   - If `entry.type === "llm"`: call `gradeWithLlm(output, expected, entry.llm_config!, defaultJudgeModel, adapter!)`. If adapter is null, return `{ passed: false, score: 0.0, reason: "LLM adapter required for LLM grading" }`.
   - If `entry.type === "composite"`: NOT supported for nesting. Return score 0.0 with reason "Nested composite graders not supported".
3. Compute `weighted_score = sum(entry.weight * result.score)`.
4. `passed = weighted_score >= config.pass_threshold`.
5. Return `GraderResult` with `score: weighted_score`, `passed`, `reason` summarizing per-grader scores, `metadata: { per_grader: Array<{ type, weight, score, passed }> }`.

## Update `src/eval/index.ts`

Add to the barrel:

```typescript
// ─── Helpers: Graders ────────────────────────────────────────────────────
export { gradeWithCode } from "./__helpers/code-grader";
export type { CustomGraderFn } from "./__helpers/code-grader";
export { gradeWithLlm } from "./__helpers/llm-grader";
export type { LlmAdapter } from "./__helpers/llm-grader";
export { gradeWithComposite } from "./__helpers/composite-grader";
```

## Verification

```bash
bunx --bun tsc --noEmit
```

## Notes

- The `LlmAdapter` interface is intentionally minimal. In Phase B, the API adapter will implement a superset of this interface. For Phase C development, the eval runner (C03) will provide a concrete Anthropic adapter implementation.
- `gradeWithCode` is synchronous. `gradeWithLlm` and `gradeWithComposite` are async.
- The LLM judge prompt uses a fixed `score >= 0.7` threshold for `passed`. This is a convention from the Anthropic eval methodology research. The composite grader's `pass_threshold` is separate and configurable.
