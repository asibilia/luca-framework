---
title: "Runtime C03: Eval runner"
area: eval
created: 2026-03-24
source: docs/runtime-architecture/research/agent-evaluation.md
depends_on: [C01, C02]
phase: runtime-c
estimated_files: 2
---

## Context

The eval runner is the core execution engine. It takes an eval suite, executes each case with the configured number of trials, routes to the appropriate grader, and aggregates results into an EvalReport.

It also provides a mock LLM adapter for development/CI use when no API key is available, and a concrete Anthropic adapter for real eval runs.

## Files to Create

### 1. `src/eval/__helpers/eval-runner.ts`

```typescript
import { randomUUID } from "node:crypto";

import type {
  EvalSuite,
  EvalCase,
  EvalResult,
  EvalReport,
  EvalRunMetadata,
  GraderResult,
} from "../__schemas/eval.schemas";
import { EvalReportSchema } from "../__schemas/eval.schemas";
import { gradeWithCode } from "./code-grader";
import { gradeWithLlm } from "./llm-grader";
import { gradeWithComposite } from "./composite-grader";
import type { LlmAdapter } from "./llm-grader";
import type { CustomGraderFn } from "./code-grader";

/**
 * Options for running an eval suite.
 */
export interface RunEvalOptions {
  /** LLM adapter for agent calls and LLM-graded cases. Required for llm/composite graders. */
  adapter: LlmAdapter | null;
  /** Map of custom grader functions keyed by eval case ID */
  custom_graders?: Map<string, CustomGraderFn>;
  /** Override trial count for all cases (useful for quick smoke runs) */
  trial_override?: number;
  /** Dry-run mode: validate suite structure without executing any cases */
  dry_run?: boolean;
  /** Agent model to use for agent calls (for metadata tracking) */
  agent_model?: string;
  /** Git commit hash of current agent definitions (for metadata tracking) */
  agent_version_hash?: string;
  /** Callback invoked after each trial completes (for progress reporting) */
  on_trial_complete?: (case_id: string, trial: number, result: EvalResult) => void;
}

/**
 * Run a single eval suite and produce an aggregated report.
 *
 * Execution model:
 * - Cases run sequentially (to avoid rate limits and ensure reproducibility)
 * - Trials within a case run sequentially (each trial must be independent)
 * - Respects suite config: timeout_ms, sampling_rate
 *
 * @param suite - The eval suite to run
 * @param options - Runner options (adapter, overrides, callbacks)
 * @returns EvalReport with all trial results and aggregate metrics
 *
 * @example
 * ```typescript
 * const report = await runEvalSuite(luRouterSuite, {
 *   adapter: null, // code-only graders don't need an adapter
 *   agent_model: "claude-sonnet-4-20250514",
 *   agent_version_hash: "abc123",
 * });
 * console.log(`pass@1: ${report.pass_at_1}, pass@k: ${report.pass_at_k}`);
 * ```
 */
export async function runEvalSuite(
  suite: EvalSuite,
  options: RunEvalOptions,
): Promise<EvalReport> { /* implementation */ }

/**
 * Run multiple eval suites in parallel (when targeting different components)
 * or sequentially (when targeting the same component).
 *
 * @param suites - Array of eval suites to run
 * @param options - Runner options shared across all suites
 * @returns Array of EvalReports, one per suite
 */
export async function runEvalSuites(
  suites: EvalSuite[],
  options: RunEvalOptions,
): Promise<EvalReport[]> { /* implementation */ }
```

**`runEvalSuite` implementation steps:**

1. **Dry-run check**: If `options.dry_run`, validate suite structure via `EvalSuiteSchema.safeParse(suite)`. Return a report with zero results and `pass_at_1: 0, pass_at_k: 0`. Log validation errors if any.

2. **Sampling**: If `suite.config.sampling_rate < 1.0`, randomly select `Math.ceil(cases.length * sampling_rate)` cases using `Math.random()`. Track both `total_cases` (original count) and `executed_cases` (sampled count).

3. **Case loop** (sequential): For each selected case:
   a. Determine trial count: `options.trial_override ?? case.trials`
   b. **Trial loop** (sequential): For each trial (1 to trialCount):
      - Record start time via `performance.now()`
      - Route to grader based on `case.grader`:
        - `"code"`: Call `gradeWithCode(case.input, case.code_grader_config!, customFn)`. Set `token_usage: { input_tokens: 0, output_tokens: 0 }`, `cost_usd: 0`.
        - `"llm"`: Call `gradeWithLlm(case.input, case.expected, case.llm_grader_config!, suite.config.judge_model, options.adapter!)`. If adapter is null, record error result.
        - `"composite"`: Call `gradeWithComposite(case.input, case.expected, case.composite_grader_config!, suite.config.judge_model, options.adapter, options.custom_graders)`.
      - Record end time, compute `latency_ms`
      - Build `EvalResult` object
      - Call `options.on_trial_complete` if provided
      - Collect result

4. **Aggregate**: Compute metrics from all results:
   - `pass_at_1`: For each case, check if any trial passed. `pass_at_1 = cases_with_any_pass / executed_cases`.
   - `pass_at_k`: For each case, check if ALL trials passed. `pass_at_k = cases_with_all_pass / executed_cases`.
   - `avg_score`: Mean of all trial scores across all cases.
   - `total_cost_usd`: Sum of all `result.cost_usd`.
   - `total_latency_ms`: Sum of all `result.latency_ms`.

5. **Build report**: Construct `EvalReport` object with all fields, `run_id: randomUUID()`, current ISO timestamp, and metadata.

6. **Validate**: `EvalReportSchema.safeParse(report)` as a sanity check. Log warning if validation fails but still return the report.

**`runEvalSuites` implementation:**

- Group suites by `component`.
- Suites targeting different components: run in parallel via `Promise.all`.
- Suites targeting the same component: run sequentially (to avoid conflicting state).
- Return array of reports maintaining input order.

### 2. `src/eval/__helpers/anthropic-adapter.ts`

Concrete Anthropic API adapter and a mock adapter for development.

```typescript
import type { LlmAdapter } from "./llm-grader";

/**
 * Create an Anthropic API adapter for real eval runs.
 *
 * Requires ANTHROPIC_API_KEY environment variable to be set.
 * Uses Bun's built-in fetch for HTTP calls.
 *
 * @returns LlmAdapter that calls the Anthropic Messages API
 * @throws Error if ANTHROPIC_API_KEY is not set
 *
 * @example
 * ```typescript
 * const adapter = createAnthropicAdapter();
 * const report = await runEvalSuite(suite, { adapter });
 * ```
 */
export function createAnthropicAdapter(): LlmAdapter { /* implementation */ }

/**
 * Create a mock adapter that returns canned responses.
 *
 * For development and CI environments without API keys.
 * The mock returns a fixed response based on the system prompt content:
 * - If system prompt contains "evaluator" (judge prompt): returns a valid
 *   judge JSON response with score 0.8 and passed true.
 * - Otherwise: returns a generic text response.
 *
 * Token usage is simulated as input_tokens: 100, output_tokens: 50.
 *
 * @returns LlmAdapter that returns mock responses without API calls
 *
 * @example
 * ```typescript
 * const mockAdapter = createMockAdapter();
 * const report = await runEvalSuite(suite, { adapter: mockAdapter });
 * ```
 */
export function createMockAdapter(): LlmAdapter { /* implementation */ }

/**
 * Create a mock adapter with custom response mapping.
 *
 * Allows tests to specify exact responses for specific inputs.
 *
 * @param responses - Map of user message substring to response text.
 *   If user message contains the key string, the mapped response is returned.
 *   Falls back to default mock response if no key matches.
 * @returns LlmAdapter with custom response behavior
 */
export function createMockAdapterWithResponses(
  responses: Map<string, string>,
): LlmAdapter { /* implementation */ }
```

**`createAnthropicAdapter` implementation:**

- Read `ANTHROPIC_API_KEY` from `process.env` (Bun auto-loads `.env`).
- Throw `new Error("ANTHROPIC_API_KEY environment variable is required for eval runs")` if not set.
- Return an object implementing `LlmAdapter.call`:
  - POST to `https://api.anthropic.com/v1/messages`
  - Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`
  - Body: `{ model, max_tokens: 1024, temperature, system: systemPrompt, messages: [{ role: "user", content: userMessage }] }`
  - Parse response: extract `content[0].text`, `usage.input_tokens`, `usage.output_tokens`
  - On HTTP error: throw with status code and error body

**`createMockAdapter` implementation:**

- Return object implementing `LlmAdapter.call`:
  - If `systemPrompt.includes("evaluator")`: return `{ text: '{"score": 0.8, "passed": true, "reasoning": "Mock evaluation: output meets rubric criteria."}', input_tokens: 100, output_tokens: 50 }`
  - Otherwise: return `{ text: "Mock response for eval", input_tokens: 100, output_tokens: 50 }`

## Update `src/eval/index.ts`

Add to the barrel:

```typescript
// ─── Helpers: Runner ─────────────────────────────────────────────────────
export { runEvalSuite, runEvalSuites } from "./__helpers/eval-runner";
export type { RunEvalOptions } from "./__helpers/eval-runner";
export {
  createAnthropicAdapter,
  createMockAdapter,
  createMockAdapterWithResponses,
} from "./__helpers/anthropic-adapter";
```

## Verification

```bash
bunx --bun tsc --noEmit
```

## Notes

- For code-only eval suites (lu-router, convergence), `adapter: null` is valid. The runner gracefully handles this by recording error results for any LLM-graded cases.
- The Anthropic adapter does NOT handle batch API. That is a future optimization flagged in the suite config but not implemented in Phase C.
- The `on_trial_complete` callback enables the CLI (C09) to show progress during long runs.
- Timeout enforcement: use `Promise.race` with `setTimeout` for `suite.config.timeout_ms`. On timeout, record `EvalResult` with `error: "Trial timed out after {timeout_ms}ms"`, `passed: false`, `score: 0.0`.
