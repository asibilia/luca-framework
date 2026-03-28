/**
 * Execute a workflow DAG wave-by-wave through an adapter interface.
 *
 * The executor:
 * 1. Validates the DAG via validateDAG() — fail early if invalid
 * 2. Topologically sorts via topologicalSort() — get wave groups
 * 3. If checkpoint provided, skips completed waves (step memoization, Inngest pattern)
 * 4. For each wave:
 *    a. Filters steps whose guards return false (mark as SKIPPED)
 *    b. Executes remaining steps via adapter.executeStep() using Promise.allSettled
 *       (fail-isolated semantics, NOT Promise.all — critical correction from research)
 *    c. Validates outputs against step outputSchema (safeParse, warn mode)
 *    d. Handles retry per step config (max retries, backoff strategy)
 *    e. Handles timeout per step config (AbortController per step, Temporal pattern)
 *    f. Accumulates results into execution context for downstream steps
 * 5. Persists checkpoint after each wave (via dag-serializer)
 * 6. Returns ExecutionResult with all step outcomes and execution trace
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — DAG Executor
 * @see docs/runtime-architecture/research/dag-engines.md — Patterns #4-6, #10
 * @see docs/runtime-architecture/research/risk-analysis.md — Risk 13
 */

import type { z } from "zod";

import type {
  WorkflowDAG,
  WorkflowStep,
  WorkflowAdapter,
  StepResult,
  ExecutionResult,
  DAGCheckpoint,
  TraceEntry,
  SkippedStepEntry,
} from "../__schemas/workflow.schemas";
import { topologicalSort } from "./dag-sorter";
import { validateDAG } from "./dag-validator";
import { saveCheckpoint, clearCheckpoint } from "./dag-serializer";

// ─── Executor Options ────────────────────────────────────────────────────────

/**
 * Options for DAG execution.
 */
export interface ExecuteDAGOptions {
  /**
   * Optional checkpoint to resume from.
   * If provided, completed steps are skipped (step memoization).
   */
  checkpoint?: DAGCheckpoint;

  /**
   * Base path for checkpoint persistence.
   * Defaults to ".planning/checkpoints".
   */
  checkpointBasePath?: string;

  /**
   * Whether to persist checkpoints after each wave.
   * Defaults to true.
   */
  persistCheckpoints?: boolean;

  /**
   * Schema validation mode.
   * - "warn": Log mismatches but continue execution (default, per Risk 11)
   * - "strict": Fail the step if output schema validation fails
   */
  schemaValidationMode?: "warn" | "strict";
}

// ─── Execute DAG ─────────────────────────────────────────────────────────────

/**
 * Execute a workflow DAG.
 *
 * @param dag - The workflow definition (must be valid)
 * @param adapter - Execution adapter (Claude, API, mock, etc.)
 * @param context - Initial execution context (accumulated across steps)
 * @param options - Execution options (checkpoint, persistence, validation mode)
 * @returns ExecutionResult with step outcomes and execution trace
 *
 * @example
 * ```typescript
 * import { executeDAG, buildPhaseDAG } from "~/workflow";
 *
 * const dag = buildPhaseDAG("test")
 *   .step("a", { handler: "handler-a" })
 *   .step("b", { handler: "handler-b", dependsOn: ["a"] })
 *   .build();
 *
 * const mockAdapter = {
 *   name: "mock",
 *   executeStep: async (step, input, ctx) => ({
 *     stepId: step.id,
 *     status: "completed" as const,
 *     output: { result: "ok" },
 *     durationMs: 10,
 *     retryCount: 0,
 *   }),
 * };
 *
 * const result = await executeDAG(dag, mockAdapter, {});
 * ```
 */
export async function executeDAG(
  dag: WorkflowDAG,
  adapter: WorkflowAdapter,
  context: Record<string, unknown>,
  options: ExecuteDAGOptions = {},
): Promise<ExecutionResult> {
  const {
    checkpoint,
    checkpointBasePath,
    persistCheckpoints = true,
    schemaValidationMode = "warn",
  } = options;

  const startTime = Date.now();
  const stepResults: Record<string, StepResult> = {};
  const skippedEntries: SkippedStepEntry[] = [];
  const trace: TraceEntry[] = [];
  const accumulatedContext: Record<string, unknown> = { ...context };

  // Step 1: Validate DAG
  const validation = validateDAG(dag);
  if (!validation.valid) {
    return {
      dagName: dag.name,
      status: "failed",
      stepResults: {},
      totalDurationMs: Date.now() - startTime,
      trace: [],
    };
  }

  // Step 2: Topologically sort into waves
  const waves = topologicalSort(dag);
  const stepMap = new Map(dag.steps.map((s) => [s.id, s]));

  // Step 3: Determine starting wave from checkpoint (step memoization)
  let startWave = 0;
  if (checkpoint) {
    startWave = checkpoint.currentWave;
    // Restore completed step results from checkpoint
    for (const [stepId, output] of Object.entries(checkpoint.completedSteps)) {
      stepResults[stepId] = {
        stepId,
        status: "completed",
        output,
        durationMs: 0,
        retryCount: 0,
      };
      accumulatedContext[stepId] = output;
    }
    // Restore skipped steps from checkpoint (structured entries)
    for (const entry of checkpoint.skippedSteps) {
      stepResults[entry.id] = {
        stepId: entry.id,
        status: "skipped",
        durationMs: 0,
        retryCount: 0,
      };
      skippedEntries.push(entry);
    }
    // Restore context from checkpoint
    Object.assign(accumulatedContext, checkpoint.context);
  }

  // Step 4: Execute waves
  let hasFailure = false;

  for (let waveIndex = startWave; waveIndex < waves.length; waveIndex++) {
    const waveStepIds = waves[waveIndex]!;
    const waveStartTime = Date.now();

    // 4a: Evaluate guards and partition into active/skipped
    const activeSteps: WorkflowStep[] = [];
    for (const stepId of waveStepIds) {
      // Skip if already completed (from checkpoint)
      if (stepResults[stepId]?.status === "completed") continue;
      if (stepResults[stepId]?.status === "skipped") continue;

      const step = stepMap.get(stepId);
      if (!step) continue;

      if (step.guard) {
        try {
          const guardResult = step.guard(accumulatedContext);
          if (!guardResult) {
            stepResults[stepId] = {
              stepId,
              status: "skipped",
              durationMs: 0,
              retryCount: 0,
            };
            skippedEntries.push({
              id: stepId,
              reason: "guard-false",
              optional: step.optional,
            });
            continue;
          }
        } catch {
          // Guard exception = guard-failed = step skipped (design doc decision)
          stepResults[stepId] = {
            stepId,
            status: "skipped",
            durationMs: 0,
            retryCount: 0,
          };
          skippedEntries.push({
            id: stepId,
            reason: "guard-exception",
            optional: step.optional,
          });
          continue;
        }
      }

      activeSteps.push(step);
    }

    // 4b: Execute active steps in parallel with Promise.allSettled (fail-isolated)
    const stepPromises = activeSteps.map((step) =>
      executeStepWithRetry(
        step,
        adapter,
        accumulatedContext,
        schemaValidationMode,
      ),
    );

    const settled = await Promise.allSettled(stepPromises);

    // 4c: Collect results
    for (let i = 0; i < activeSteps.length; i++) {
      const step = activeSteps[i]!;
      const result = settled[i]!;

      if (result.status === "fulfilled") {
        stepResults[step.id] = result.value;
        if (result.value.status === "completed" && result.value.output) {
          accumulatedContext[step.id] = result.value.output;
        }
        if (
          result.value.status === "failed" ||
          result.value.status === "timeout"
        ) {
          hasFailure = true;
        }
      } else {
        // Promise rejected — unexpected error in executeStepWithRetry
        stepResults[step.id] = {
          stepId: step.id,
          status: "failed",
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          durationMs: 0,
          retryCount: 0,
        };
        hasFailure = true;
      }
    }

    // Record trace entry
    trace.push({
      wave: waveIndex,
      stepIds: waveStepIds,
      startedAt: new Date(waveStartTime).toISOString(),
      completedAt: new Date().toISOString(),
    });

    // 5: Persist checkpoint after each wave
    if (persistCheckpoints) {
      const currentCheckpoint: DAGCheckpoint = {
        dagName: dag.name,
        dagVersion: dag.version,
        checkpointSchemaVersion: 1,
        startedAt: checkpoint?.startedAt ?? new Date(startTime).toISOString(),
        currentWave: waveIndex + 1,
        completedSteps: Object.fromEntries(
          Object.entries(stepResults)
            .filter(([, r]) => r.status === "completed")
            .map(([id, r]) => [id, r.output]),
        ),
        skippedSteps: skippedEntries,
        failedSteps: Object.fromEntries(
          Object.entries(stepResults)
            .filter(([, r]) => r.status === "failed" || r.status === "timeout")
            .map(([id, r]) => [
              id,
              { error: r.error ?? "Unknown error", retryCount: r.retryCount },
            ]),
        ),
        context: accumulatedContext,
      };
      saveCheckpoint(currentCheckpoint, checkpointBasePath);
    }
  }

  // 6: Clear checkpoint on successful completion
  if (persistCheckpoints && !hasFailure) {
    clearCheckpoint(dag.name, checkpointBasePath);
  }

  // Determine overall status
  const allStepIds = dag.steps.map((s) => s.id);
  const allCompleted = allStepIds.every(
    (id) =>
      stepResults[id]?.status === "completed" ||
      stepResults[id]?.status === "skipped",
  );

  const status = allCompleted ? "completed" : hasFailure ? "failed" : "partial";

  return {
    dagName: dag.name,
    status,
    stepResults,
    totalDurationMs: Date.now() - startTime,
    trace,
  };
}

// ─── Step Execution with Retry ───────────────────────────────────────────────

/**
 * Execute a single step with retry logic and timeout.
 *
 * Handles:
 * - Per-step timeout via AbortController (Temporal pattern)
 * - Retry with configurable backoff (none/linear/exponential)
 * - Output schema validation (warn or strict mode)
 */
async function executeStepWithRetry(
  step: WorkflowStep,
  adapter: WorkflowAdapter,
  context: Record<string, unknown>,
  schemaValidationMode: "warn" | "strict",
): Promise<StepResult> {
  const maxRetries = step.retry?.max ?? 1;
  const backoff = step.retry?.backoff ?? "none";

  // Gather input from context (outputs of dependency steps)
  const input: Record<string, unknown> = {};
  for (const depId of step.dependsOn) {
    if (context[depId] !== undefined) {
      input[depId] = context[depId];
    }
  }

  // Validate input schema if defined
  if (step.inputSchema) {
    const zodSchema = step.inputSchema as z.ZodTypeAny;
    if (typeof zodSchema.safeParse === "function") {
      const inputResult = zodSchema.safeParse(input);
      if (!inputResult.success) {
        if (schemaValidationMode === "strict") {
          return {
            stepId: step.id,
            status: "failed",
            error: `Input schema validation failed: ${inputResult.error.message}`,
            durationMs: 0,
            retryCount: 0,
          };
        }
        // warn mode: log but continue
        console.warn(
          `[workflow] Step "${step.id}" input schema mismatch:`,
          inputResult.error.message,
        );
      }
    }
  }

  let lastError: string | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Apply backoff delay for retries (not on first attempt)
    if (attempt > 0) {
      const delayMs = computeBackoffDelay(backoff, attempt);
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    }

    const stepStartTime = Date.now();

    try {
      // Execute with timeout if configured
      let result: StepResult;

      if (step.timeout) {
        result = await executeWithTimeout(
          step,
          adapter,
          input,
          context,
          step.timeout,
        );
      } else {
        result = await adapter.executeStep(step, input, context);
      }

      // Validate output schema if defined and step completed
      if (result.status === "completed" && step.outputSchema && result.output) {
        const zodSchema = step.outputSchema as z.ZodTypeAny;
        if (typeof zodSchema.safeParse === "function") {
          const outputResult = zodSchema.safeParse(result.output);
          if (!outputResult.success) {
            if (schemaValidationMode === "strict") {
              return {
                stepId: step.id,
                status: "failed",
                error: `Output schema validation failed: ${outputResult.error.message}`,
                durationMs: Date.now() - stepStartTime,
                retryCount: attempt,
              };
            }
            // warn mode: log but continue
            console.warn(
              `[workflow] Step "${step.id}" output schema mismatch:`,
              outputResult.error.message,
            );
          }
        }
      }

      // Update duration and retry count
      return {
        ...result,
        durationMs: Date.now() - stepStartTime,
        retryCount: attempt,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      // If this is the last attempt, fall through to return failure
      if (attempt === maxRetries - 1) break;
    }
  }

  // All retries exhausted
  return {
    stepId: step.id,
    status: "failed",
    error: lastError ?? "Unknown error after retries",
    durationMs: 0,
    retryCount: maxRetries - 1,
  };
}

// ─── Timeout Execution ───────────────────────────────────────────────────────

/**
 * Execute a step with AbortController-based timeout.
 *
 * @see docs/runtime-architecture/research/dag-engines.md — Pattern #10 (AbortController per step)
 */
async function executeWithTimeout(
  step: WorkflowStep,
  adapter: WorkflowAdapter,
  input: Record<string, unknown>,
  context: Record<string, unknown>,
  timeoutMs: number,
): Promise<StepResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resultPromise = adapter.executeStep(step, input, {
      ...context,
      __abortSignal: controller.signal,
    });

    const timeoutPromise = new Promise<StepResult>((_, reject) => {
      controller.signal.addEventListener("abort", () => {
        reject(new Error(`Step "${step.id}" timed out after ${timeoutMs}ms`));
      });
    });

    const result = await Promise.race([resultPromise, timeoutPromise]);
    return result;
  } catch (err) {
    if (controller.signal.aborted) {
      return {
        stepId: step.id,
        status: "timeout",
        error: `Step "${step.id}" timed out after ${timeoutMs}ms`,
        durationMs: timeoutMs,
        retryCount: 0,
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Backoff Computation ─────────────────────────────────────────────────────

/**
 * Compute delay in milliseconds for retry backoff.
 *
 * - none: 0ms
 * - linear: attempt * 1000ms (1s, 2s, 3s, ...)
 * - exponential: 2^attempt * 500ms (500ms, 1s, 2s, 4s, ...)
 */
function computeBackoffDelay(
  strategy: "none" | "linear" | "exponential",
  attempt: number,
): number {
  switch (strategy) {
    case "none":
      return 0;
    case "linear":
      return attempt * 1000;
    case "exponential":
      return Math.pow(2, attempt) * 500;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Simple async sleep.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
