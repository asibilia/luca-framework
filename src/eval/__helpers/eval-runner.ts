import { randomUUID } from "node:crypto";

import type {
  EvalSuite,
  EvalCase,
  EvalResult,
  EvalReport,
  EvalRunMetadata,
  GraderResult,
} from "../__schemas/eval.schemas";
import { EvalReportSchema, EvalSuiteSchema } from "../__schemas/eval.schemas";
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
  on_trial_complete?: (
    case_id: string,
    trial: number,
    result: EvalResult,
  ) => void;
}

/**
 * Grade a single trial of a single eval case.
 *
 * Routes to the appropriate grader based on `evalCase.grader` type
 * and wraps the result with timeout enforcement via Promise.race.
 *
 * @param evalCase - The eval case being evaluated
 * @param timeoutMs - Per-case timeout in milliseconds
 * @param adapter - LLM adapter (required for llm/composite graders)
 * @param judgeModel - Model identifier for LLM judge
 * @param customGraders - Map of custom grader functions
 * @returns GraderResult from the appropriate grader
 */
async function gradeTrial(
  evalCase: EvalCase,
  timeoutMs: number,
  adapter: LlmAdapter | null,
  judgeModel: string,
  customGraders?: Map<string, CustomGraderFn>,
): Promise<GraderResult> {
  const gradePromise = (async (): Promise<GraderResult> => {
    switch (evalCase.grader) {
      case "code": {
        if (!evalCase.code_grader_config) {
          return {
            passed: false,
            score: 0.0,
            reason: "Code grader config missing",
            metadata: {},
          };
        }
        const customFn = customGraders?.get(evalCase.id);
        return gradeWithCode(
          evalCase.input,
          evalCase.code_grader_config,
          customFn,
        );
      }

      case "llm": {
        if (!adapter) {
          return {
            passed: false,
            score: 0.0,
            reason: "LLM adapter required for LLM grading but adapter is null",
            metadata: {},
          };
        }
        if (!evalCase.llm_grader_config) {
          return {
            passed: false,
            score: 0.0,
            reason: "LLM grader config missing",
            metadata: {},
          };
        }
        return gradeWithLlm(
          evalCase.input,
          evalCase.expected,
          evalCase.llm_grader_config,
          judgeModel,
          adapter,
        );
      }

      case "composite": {
        if (!evalCase.composite_grader_config) {
          return {
            passed: false,
            score: 0.0,
            reason: "Composite grader config missing",
            metadata: {},
          };
        }
        return gradeWithComposite(
          evalCase.input,
          evalCase.expected,
          evalCase.composite_grader_config,
          judgeModel,
          adapter,
          evalCase.id,
          customGraders,
        );
      }

      default:
        return {
          passed: false,
          score: 0.0,
          reason: `Unknown grader type: ${evalCase.grader}`,
          metadata: {},
        };
    }
  })();

  // Enforce timeout via Promise.race
  const timeoutPromise = new Promise<GraderResult>((resolve) => {
    setTimeout(() => {
      resolve({
        passed: false,
        score: 0.0,
        reason: `Trial timed out after ${timeoutMs}ms`,
        metadata: { timeout: true },
      });
    }, timeoutMs);
  });

  return Promise.race([gradePromise, timeoutPromise]);
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
): Promise<EvalReport> {
  // 1. Dry-run check
  if (options.dry_run) {
    const validation = EvalSuiteSchema.safeParse(suite);
    if (!validation.success) {
      console.warn(
        `[eval-runner] Dry-run validation errors for suite ${suite.id}:`,
        validation.error.issues,
      );
    }

    return buildReport(suite, [], options);
  }

  // 2. Sampling
  let selectedCases: EvalCase[];
  if (suite.config.sampling_rate < 1.0) {
    const sampleSize = Math.ceil(
      suite.cases.length * suite.config.sampling_rate,
    );
    // Shuffle and take first N
    const shuffled = [...suite.cases].sort(() => Math.random() - 0.5);
    selectedCases = shuffled.slice(0, sampleSize);
  } else {
    selectedCases = suite.cases;
  }

  // 3. Case loop (sequential)
  const allResults: EvalResult[] = [];

  for (const evalCase of selectedCases) {
    const trialCount = options.trial_override ?? evalCase.trials;

    // Trial loop (sequential)
    for (let trial = 1; trial <= trialCount; trial++) {
      const startTime = performance.now();

      const graderResult = await gradeTrial(
        evalCase,
        suite.config.timeout_ms,
        options.adapter,
        suite.config.judge_model,
        options.custom_graders,
      );

      const endTime = performance.now();
      const latencyMs = endTime - startTime;

      // Determine token usage and cost
      const tokenUsage = graderResult.metadata?.input_tokens
        ? {
            input_tokens: graderResult.metadata.input_tokens as number,
            output_tokens: graderResult.metadata.output_tokens as number,
          }
        : { input_tokens: 0, output_tokens: 0 };

      const costUsd = evalCase.grader === "code" ? 0 : estimateCost(tokenUsage);

      const isTimeout = graderResult.metadata?.timeout === true;

      const result: EvalResult = {
        case_id: evalCase.id,
        trial,
        passed: graderResult.passed,
        score: graderResult.score,
        grader_output: {
          passed: graderResult.passed,
          score: graderResult.score,
          reason: graderResult.reason,
          metadata: graderResult.metadata ?? {},
        },
        latency_ms: latencyMs,
        token_usage: tokenUsage,
        cost_usd: costUsd,
        timestamp: new Date().toISOString(),
        ...(isTimeout
          ? { error: `Trial timed out after ${suite.config.timeout_ms}ms` }
          : {}),
      };

      allResults.push(result);

      if (options.on_trial_complete) {
        options.on_trial_complete(evalCase.id, trial, result);
      }
    }
  }

  // 4-6. Build report with aggregation and validation
  return buildReport(suite, allResults, options);
}

/**
 * Estimate cost in USD from token usage.
 *
 * Uses approximate Haiku pricing as a conservative baseline.
 * Actual pricing depends on the model used.
 *
 * @param tokenUsage - Input and output token counts
 * @returns Estimated cost in USD
 */
function estimateCost(tokenUsage: {
  input_tokens: number;
  output_tokens: number;
}): number {
  // Approximate Haiku pricing: $0.25/1M input, $1.25/1M output
  const inputCost = (tokenUsage.input_tokens / 1_000_000) * 0.25;
  const outputCost = (tokenUsage.output_tokens / 1_000_000) * 1.25;
  return inputCost + outputCost;
}

/**
 * Build an EvalReport from results with aggregation and self-validation.
 *
 * Computes pass_at_1, pass_at_k, avg_score, total_cost_usd,
 * total_latency_ms from the provided results.
 *
 * @param suite - The eval suite that was run
 * @param results - All trial results collected during execution
 * @param options - Runner options (for metadata)
 * @returns Completed EvalReport
 */
function buildReport(
  suite: EvalSuite,
  results: EvalResult[],
  options: RunEvalOptions,
): EvalReport {
  // Group results by case_id
  const resultsByCase = new Map<string, EvalResult[]>();
  for (const result of results) {
    const existing = resultsByCase.get(result.case_id) ?? [];
    existing.push(result);
    resultsByCase.set(result.case_id, existing);
  }

  const executedCases = resultsByCase.size;

  // Compute aggregate metrics
  let casesWithAnyPass = 0;
  let casesWithAllPass = 0;

  for (const [, caseResults] of resultsByCase) {
    const anyPassed = caseResults.some((r) => r.passed);
    const allPassed = caseResults.every((r) => r.passed);

    if (anyPassed) casesWithAnyPass++;
    if (allPassed) casesWithAllPass++;
  }

  const passAt1 = executedCases > 0 ? casesWithAnyPass / executedCases : 0;
  const passAtK = executedCases > 0 ? casesWithAllPass / executedCases : 0;

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const avgScore = results.length > 0 ? totalScore / results.length : 0;

  const totalCostUsd = results.reduce((sum, r) => sum + r.cost_usd, 0);
  const totalLatencyMs = results.reduce((sum, r) => sum + r.latency_ms, 0);

  const metadata: EvalRunMetadata = {
    agent_model: options.agent_model ?? "unknown",
    judge_model: suite.config.judge_model,
    agent_version_hash: options.agent_version_hash ?? "unknown",
    suite_config: suite.config,
  };

  const report: EvalReport = {
    run_id: randomUUID(),
    timestamp: new Date().toISOString(),
    component: suite.component,
    suite_id: suite.id,
    total_cases: suite.cases.length,
    executed_cases: executedCases,
    pass_at_1: passAt1,
    pass_at_k: passAtK,
    avg_score: avgScore,
    total_cost_usd: totalCostUsd,
    total_latency_ms: totalLatencyMs,
    results,
    metadata,
  };

  // 6. Self-validate report
  const validation = EvalReportSchema.safeParse(report);
  if (!validation.success) {
    console.warn(
      `[eval-runner] Report self-validation failed for suite ${suite.id}:`,
      validation.error.issues,
    );
  }

  return report;
}

/**
 * Run multiple eval suites in parallel (when targeting different components)
 * or sequentially (when targeting the same component).
 *
 * Suites targeting different components run in parallel via Promise.all.
 * Suites targeting the same component run sequentially to avoid conflicting state.
 * Results are returned maintaining input order.
 *
 * @param suites - Array of eval suites to run
 * @param options - Runner options shared across all suites
 * @returns Array of EvalReports, one per suite, maintaining input order
 *
 * @example
 * ```typescript
 * const reports = await runEvalSuites(
 *   [routerSuite, plannerSuite, convergenceSuite],
 *   { adapter: mockAdapter, agent_model: "claude-sonnet-4-20250514" },
 * );
 * ```
 */
export async function runEvalSuites(
  suites: EvalSuite[],
  options: RunEvalOptions,
): Promise<EvalReport[]> {
  // Group suites by component, preserving original indices
  const byComponent = new Map<
    string,
    Array<{ suite: EvalSuite; originalIndex: number }>
  >();

  for (let i = 0; i < suites.length; i++) {
    const suite = suites[i]!;
    const group = byComponent.get(suite.component) ?? [];
    group.push({ suite, originalIndex: i });
    byComponent.set(suite.component, group);
  }

  // Run component groups in parallel, suites within each group sequentially
  const reportSlots: EvalReport[] = new Array(suites.length);

  const componentPromises = Array.from(byComponent.values()).map(
    async (group) => {
      for (const { suite, originalIndex } of group) {
        const report = await runEvalSuite(suite, options);
        reportSlots[originalIndex] = report;
      }
    },
  );

  await Promise.all(componentPromises);

  return reportSlots;
}
