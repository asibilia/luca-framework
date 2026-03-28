/**
 * Progressive Disclosure Executor Mode.
 *
 * Wraps DAG execution with zone-adaptive structured summaries that degrade
 * based on context budget zones. Downstream steps receive appropriately sized
 * context from upstream steps without consuming excessive context budget.
 *
 * Context zone values match the existing contextZoneSchema from hooks:
 *   "peak" (0-30%), "good" (30-50%), "degrading" (50-70%), "stop" (70%+)
 *
 * Degradation policy:
 *   - "peak"/"good" -> full summary (intent, decisions, artifacts, outputPointers)
 *   - "degrading"    -> decisions-only (drop artifacts and outputPointers)
 *   - "stop"         -> minimal (keep only stepId and status)
 *
 * @see .planning/phases/222-anti-skip-infrastructure/01-CONTEXT.md — Decision #3
 * @see .planning/phases/222-anti-skip-infrastructure/01-PREMORTEM.md — Constraint #3
 */

import { z } from "zod";

import type {
  WorkflowDAG,
  WorkflowAdapter,
  ExecutionResult,
  StepResult,
} from "../__schemas/workflow.schemas";
import type { ExecuteDAGOptions } from "./dag-executor";
import { topologicalSort } from "./dag-sorter";

// ─── Context Zone (local definition matching hooks contextZoneSchema) ────────

/**
 * Context zones matching the quality degradation curve from CLAUDE.md.
 *
 * These values intentionally mirror the contextZoneSchema defined in
 * src/hooks/__schemas/hook.schemas.ts. Defined locally to avoid a T3->T1
 * tier violation (hooks is T3 Build, workflow is T1 Core).
 *
 * Values: "peak" | "good" | "degrading" | "stop"
 * The "stop" zone maps to what CLAUDE.md calls "POOR" (>70% usage).
 */
export const CONTEXT_ZONES = ["peak", "good", "degrading", "stop"] as const;
export type ContextZone = (typeof CONTEXT_ZONES)[number];

// ─── Step Summary Schema ─────────────────────────────────────────────────────

/**
 * Structured summary of a completed step's execution.
 *
 * Produced after each wave completes and degraded based on the current
 * context zone before injection into downstream step context.
 */
export const StepSummarySchema = z.object({
  /** Step ID */
  stepId: z.string(),
  /** One-sentence intent */
  intent: z.string().default(""),
  /** Key decisions made during execution */
  decisions: z.array(z.string()).default([]),
  /** File paths written or modified */
  artifacts: z.array(z.string()).default([]),
  /** Pointers to outputs (not full output content) */
  outputPointers: z.array(z.string()).default([]),
  /** Step pass/fail status */
  status: z.enum(["completed", "failed", "skipped"]),
});

export type StepSummary = z.infer<typeof StepSummarySchema>;

// ─── Progressive Executor Config Schema ──────────────────────────────────────

/**
 * Configuration for progressive execution behavior.
 *
 * When `contextMode` is provided, it overrides zone-based degradation
 * (testing override per CONTEXT.md Decision #3).
 */
export const ProgressiveExecutorConfigSchema = z.object({
  /** Override context mode (bypasses zone-based degradation) */
  contextMode: z
    .enum(["full", "summary", "decisions-only", "minimal"])
    .optional(),
  /**
   * Zone boundaries as context usage percentages.
   * Maps to existing ContextZone values from the quality degradation curve.
   */
  zoneBoundaries: z
    .object({
      /** 0 to peakEnd% -> "peak" zone */
      peakEnd: z.number().default(30),
      /** peakEnd to goodEnd% -> "good" zone */
      goodEnd: z.number().default(50),
      /** goodEnd to degradingEnd% -> "degrading" zone, above -> "stop" */
      degradingEnd: z.number().default(70),
    })
    .default({ peakEnd: 30, goodEnd: 50, degradingEnd: 70 }),
});

export type ProgressiveExecutorConfig = z.infer<
  typeof ProgressiveExecutorConfigSchema
>;

// ─── Zone Resolution ─────────────────────────────────────────────────────────

/**
 * Map a context usage percentage to a context zone.
 *
 * Uses the quality degradation curve from CLAUDE.md:
 *   0-30%  -> "peak"  (thorough, comprehensive)
 *   30-50% -> "good"  (confident, solid work)
 *   50-70% -> "degrading" (efficiency mode begins)
 *   70%+   -> "stop"  (rushed, minimal)
 *
 * @param usagePercent - Current context usage as a percentage (0-100)
 * @param boundaries - Optional custom zone boundaries
 * @returns The resolved ContextZone value
 *
 * @example
 * ```typescript
 * resolveContextZone(25) // -> "peak"
 * resolveContextZone(40) // -> "good"
 * resolveContextZone(60) // -> "degrading"
 * resolveContextZone(80) // -> "stop"
 * ```
 */
export function resolveContextZone(
  usagePercent: number,
  boundaries?: {
    peakEnd?: number;
    goodEnd?: number;
    degradingEnd?: number;
  },
): ContextZone {
  const peakEnd = boundaries?.peakEnd ?? 30;
  const goodEnd = boundaries?.goodEnd ?? 50;
  const degradingEnd = boundaries?.degradingEnd ?? 70;

  if (usagePercent <= peakEnd) return "peak";
  if (usagePercent <= goodEnd) return "good";
  if (usagePercent <= degradingEnd) return "degrading";
  return "stop";
}

// ─── Summary Degradation ─────────────────────────────────────────────────────

/**
 * Degrade a step summary based on the current context zone.
 *
 * Degradation policy:
 *   - "peak"/"good":  Full summary (intent, decisions, artifacts, outputPointers)
 *   - "degrading":    Decisions-only (drop artifacts and outputPointers)
 *   - "stop":         Minimal (keep only stepId and status)
 *
 * @param summary - The full step summary to degrade
 * @param zone - The current context zone
 * @returns A new StepSummary with fields stripped per zone policy
 *
 * @example
 * ```typescript
 * const full = { stepId: "a", intent: "do X", decisions: ["chose Y"],
 *                artifacts: ["src/a.ts"], outputPointers: ["ref:a"], status: "completed" as const };
 * degradeSummary(full, "stop")
 * // -> { stepId: "a", intent: "", decisions: [], artifacts: [], outputPointers: [], status: "completed" }
 * ```
 */
export function degradeSummary(
  summary: StepSummary,
  zone: ContextZone,
): StepSummary {
  switch (zone) {
    case "peak":
    case "good":
      // Full summary — return as-is
      return { ...summary };

    case "degrading":
      // Decisions-only — drop artifacts and outputPointers
      return {
        ...summary,
        artifacts: [],
        outputPointers: [],
      };

    case "stop":
      // Minimal — keep only stepId and status
      return {
        stepId: summary.stepId,
        intent: "",
        decisions: [],
        artifacts: [],
        outputPointers: [],
        status: summary.status,
      };
  }
}

// ─── Summary Formatting ──────────────────────────────────────────────────────

/**
 * Render degraded summaries as a compact text block for downstream step context.
 *
 * Uses markdown-style formatting: step ID as header, decisions as bullet list.
 * The output is designed for inclusion in LLM context, not for human display.
 *
 * @param summaries - Array of step summaries (already degraded)
 * @param zone - Current context zone (affects formatting density)
 * @returns Formatted text block suitable for context injection
 *
 * @example
 * ```typescript
 * formatSummariesForContext([
 *   { stepId: "classify", intent: "Classified task", decisions: ["Set complexity=MODERATE"],
 *     artifacts: [], outputPointers: [], status: "completed" },
 * ], "degrading")
 * // -> "### classify [completed]\nClassified task\n- Set complexity=MODERATE\n"
 * ```
 */
export function formatSummariesForContext(
  summaries: StepSummary[],
  zone: ContextZone,
): string {
  if (summaries.length === 0) return "";

  const lines: string[] = [];

  for (const summary of summaries) {
    const degraded = degradeSummary(summary, zone);

    // Header line: step ID and status
    lines.push(`### ${degraded.stepId} [${degraded.status}]`);

    // Intent (if present after degradation)
    if (degraded.intent) {
      lines.push(degraded.intent);
    }

    // Decisions as bullet list
    for (const decision of degraded.decisions) {
      lines.push(`- ${decision}`);
    }

    // Artifacts (only present in full mode)
    if (degraded.artifacts.length > 0) {
      lines.push(`Files: ${degraded.artifacts.join(", ")}`);
    }

    // Output pointers (only present in full mode)
    if (degraded.outputPointers.length > 0) {
      lines.push(`Outputs: ${degraded.outputPointers.join(", ")}`);
    }

    // Blank line between summaries
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Context Mode to Zone Mapping ────────────────────────────────────────────

/**
 * Map a contextMode override to an equivalent ContextZone for degradation.
 *
 * Used when `ProgressiveExecutorConfig.contextMode` is set, bypassing
 * zone-based degradation per CONTEXT.md Decision #3.
 *
 * @param mode - The explicit context mode override
 * @returns The equivalent ContextZone for degradation purposes
 */
function contextModeToZone(
  mode: "full" | "summary" | "decisions-only" | "minimal",
): ContextZone {
  switch (mode) {
    case "full":
    case "summary":
      return "peak";
    case "decisions-only":
      return "degrading";
    case "minimal":
      return "stop";
  }
}

// ─── Step Summary Builder ────────────────────────────────────────────────────

/**
 * Build a StepSummary from a StepResult.
 *
 * Extracts structured summary fields from the step result output.
 * If the output contains `__summary` metadata, those fields are used.
 * Otherwise, a minimal summary is built from the step ID and status.
 *
 * @param result - The step execution result
 * @returns A StepSummary with available fields populated
 */
function buildStepSummary(result: StepResult): StepSummary {
  const output = result.output as Record<string, unknown> | undefined;

  // Check if the step output includes structured summary metadata
  const summaryMeta = output?.__summary as Record<string, unknown> | undefined;

  const status: StepSummary["status"] =
    result.status === "completed"
      ? "completed"
      : result.status === "skipped"
        ? "skipped"
        : "failed";

  return {
    stepId: result.stepId,
    intent: typeof summaryMeta?.intent === "string" ? summaryMeta.intent : "",
    decisions: Array.isArray(summaryMeta?.decisions)
      ? (summaryMeta.decisions as string[])
      : [],
    artifacts: Array.isArray(summaryMeta?.artifacts)
      ? (summaryMeta.artifacts as string[])
      : [],
    outputPointers: Array.isArray(summaryMeta?.outputPointers)
      ? (summaryMeta.outputPointers as string[])
      : [],
    status,
  };
}

// ─── Progressive Executor ────────────────────────────────────────────────────

/**
 * Execute a workflow DAG with progressive disclosure behavior.
 *
 * Wraps DAG execution with zone-adaptive structured summaries. After each
 * wave completes, builds StepSummary entries from step results, degrades
 * them based on the current context zone, and injects them into the
 * execution context for downstream steps.
 *
 * **PREMORTEM Constraint #3:** Re-queries context zone via
 * `getContextUsagePercent()` at each wave boundary, not just at invocation
 * time. The zone may change as waves consume tokens.
 *
 * @param dag - The workflow DAG to execute
 * @param adapter - Execution adapter (Claude, API, mock, etc.)
 * @param context - Initial execution context
 * @param options - Execution options extended with progressive config
 * @returns ExecutionResult augmented with accumulated step summaries
 *
 * @example
 * ```typescript
 * import { executeProgressively, buildPhaseDAG } from "~/workflow";
 *
 * const dag = buildPhaseDAG("example")
 *   .step("a", { handler: "handler-a" })
 *   .step("b", { handler: "handler-b", dependsOn: ["a"] })
 *   .build();
 *
 * const result = await executeProgressively(dag, mockAdapter, {}, {
 *   getContextUsagePercent: async () => 25, // Always peak zone
 * });
 *
 * console.log(result.summaries); // StepSummary[] for all completed steps
 * ```
 */
export async function executeProgressively(
  dag: WorkflowDAG,
  adapter: WorkflowAdapter,
  context: Record<string, unknown>,
  options: ExecuteDAGOptions & {
    progressiveConfig?: ProgressiveExecutorConfig;
    getContextUsagePercent?: () => Promise<number>;
  } = {},
): Promise<ExecutionResult & { summaries: StepSummary[] }> {
  const {
    progressiveConfig,
    getContextUsagePercent,
    checkpoint,
    ...dagOptions
  } = options;

  // Parse config with schema defaults
  const config = ProgressiveExecutorConfigSchema.safeParse(
    progressiveConfig ?? {},
  );
  const parsedConfig = config.success
    ? config.data
    : ProgressiveExecutorConfigSchema.parse({});

  // Default context usage callback: returns 0 (peak zone, no degradation)
  const getUsage = getContextUsagePercent ?? (async () => 0);

  // Get wave structure for the DAG
  const waves = topologicalSort(dag);
  const stepMap = new Map(dag.steps.map((s) => [s.id, s]));

  const startTime = Date.now();
  const allSummaries: StepSummary[] = [];
  const accumulatedContext: Record<string, unknown> = { ...context };
  const allStepResults: Record<string, StepResult> = {};

  // Determine starting wave from checkpoint
  let startWave = 0;
  if (checkpoint) {
    startWave = checkpoint.currentWave;
    // Restore completed step results from checkpoint
    for (const [stepId, output] of Object.entries(checkpoint.completedSteps)) {
      allStepResults[stepId] = {
        stepId,
        status: "completed",
        output,
        durationMs: 0,
        retryCount: 0,
      };
      accumulatedContext[stepId] = output;
      // Build summaries for already-completed steps
      allSummaries.push(buildStepSummary(allStepResults[stepId]!));
    }
    // Restore context from checkpoint
    Object.assign(accumulatedContext, checkpoint.context);
  }

  // Execute wave-by-wave with per-wave zone re-query
  for (let waveIndex = startWave; waveIndex < waves.length; waveIndex++) {
    // PREMORTEM Constraint #3: Re-query context zone at each wave boundary
    const usagePercent = await getUsage();

    // Resolve the effective zone for this wave
    let effectiveZone: ContextZone;
    if (parsedConfig.contextMode) {
      // contextMode override bypasses zone resolution (CONTEXT.md Decision #3)
      effectiveZone = contextModeToZone(parsedConfig.contextMode);
    } else {
      effectiveZone = resolveContextZone(
        usagePercent,
        parsedConfig.zoneBoundaries,
      );
    }

    // Inject degraded prior summaries into context for this wave's steps
    if (allSummaries.length > 0) {
      accumulatedContext.__priorStepSummaries = formatSummariesForContext(
        allSummaries,
        effectiveZone,
      );
    }

    // Execute this wave's steps via the adapter
    const waveStepIds = waves[waveIndex]!;

    const wavePromises = waveStepIds
      .filter((stepId) => {
        // Skip already-completed steps (from checkpoint)
        if (allStepResults[stepId]?.status === "completed") return false;
        if (allStepResults[stepId]?.status === "skipped") return false;
        return true;
      })
      .map(async (stepId) => {
        const step = stepMap.get(stepId);
        if (!step) return null;

        // Evaluate guard
        if (step.guard) {
          try {
            if (!step.guard(accumulatedContext)) {
              const skippedResult: StepResult = {
                stepId,
                status: "skipped",
                durationMs: 0,
                retryCount: 0,
              };
              return skippedResult;
            }
          } catch {
            const skippedResult: StepResult = {
              stepId,
              status: "skipped",
              durationMs: 0,
              retryCount: 0,
            };
            return skippedResult;
          }
        }

        // Gather input from context (outputs of dependency steps)
        const input: Record<string, unknown> = {};
        for (const depId of step.dependsOn) {
          if (accumulatedContext[depId] !== undefined) {
            input[depId] = accumulatedContext[depId];
          }
        }

        try {
          return await adapter.executeStep(step, input, accumulatedContext);
        } catch (err) {
          const errorResult: StepResult = {
            stepId,
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
            durationMs: 0,
            retryCount: 0,
          };
          return errorResult;
        }
      });

    const settled = await Promise.allSettled(wavePromises);

    // Collect results and build summaries for this wave
    for (const result of settled) {
      if (result.status === "fulfilled" && result.value) {
        const stepResult = result.value;
        allStepResults[stepResult.stepId] = stepResult;

        if (stepResult.status === "completed" && stepResult.output) {
          accumulatedContext[stepResult.stepId] = stepResult.output;
        }

        allSummaries.push(buildStepSummary(stepResult));
      } else if (result.status === "rejected") {
        // Promise.allSettled shouldn't reject, but handle gracefully
        const errorResult: StepResult = {
          stepId: "unknown",
          status: "failed",
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
          durationMs: 0,
          retryCount: 0,
        };
        allStepResults[errorResult.stepId] = errorResult;
        allSummaries.push(buildStepSummary(errorResult));
      }
    }
  }

  // Determine overall status
  const allStepIds = dag.steps.map((s) => s.id);
  const hasFailure = allStepIds.some(
    (id) =>
      allStepResults[id]?.status === "failed" ||
      allStepResults[id]?.status === "timeout",
  );
  const allCompleted = allStepIds.every(
    (id) =>
      allStepResults[id]?.status === "completed" ||
      allStepResults[id]?.status === "skipped",
  );

  const status = allCompleted ? "completed" : hasFailure ? "failed" : "partial";

  return {
    dagName: dag.name,
    status,
    stepResults: allStepResults,
    totalDurationMs: Date.now() - startTime,
    trace: [],
    summaries: allSummaries,
  };
}
