/**
 * Deterministic process-data compute module.
 *
 * Reads a state JSON file (typically `.planning/state.json`) and computes
 * aggregate metrics: duration, harness pass rate, task completion rate,
 * deviation count, and convergence iterations.
 *
 * CLI entry: `bun src/process-data/compute.ts --context=<path>`
 *
 * Zero LLM dependency. Zero MuninnDB writes. Purely mechanical.
 *
 * @module process-data/compute
 */

import {
  processDataInputSchema,
  processDataMetricsSchema,
} from "../__schemas/process-data.schemas";

import type { ProcessDataMetrics } from "../__schemas/process-data.schemas";

// ─── Core Compute ────────────────────────────────────────────────────────

/**
 * Compute process-data metrics from a parsed state object.
 *
 * @param raw - The raw JSON object read from the context file
 * @returns Computed metrics object matching `processDataMetricsSchema`
 */
export const computeMetrics = (raw: unknown): ProcessDataMetrics => {
  const parseResult = processDataInputSchema.safeParse(raw);
  if (!parseResult.success) {
    throw new Error(
      `Invalid context file: ${parseResult.error.issues.map((i) => i.message).join(", ")}`,
    );
  }

  const data = parseResult.data;
  const ctx = data.context;

  // Phase — extract from context.phase_results or fallback to "unknown"
  const phaseResults = ctx?.phase_results ?? [];
  const lastPhase =
    phaseResults.length > 0 ? String(phaseResults.length) : "unknown";

  // Duration — difference between started_at and last_transition_at
  let durationMs = 0;
  if (ctx?.started_at && ctx?.last_transition_at) {
    const start = new Date(ctx.started_at).getTime();
    const end = new Date(ctx.last_transition_at).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      durationMs = end - start;
    }
  }

  // Harness pass rate
  const harnessRuns = ctx?.harness_runs ?? [];
  const harnessPassRate =
    harnessRuns.length > 0
      ? harnessRuns.filter((r) => r.passed).length / harnessRuns.length
      : 1.0;

  // Task completion rate
  const tasks = ctx?.tasks ?? [];
  const taskCompletionRate =
    tasks.length > 0
      ? tasks.filter((t) => t.status === "complete").length / tasks.length
      : 1.0;

  // Deviation count
  const deviationCount = tasks.filter((t) => t.deviated).length;

  // Convergence iterations
  const convergenceIterations = harnessRuns.reduce(
    (sum, r) => sum + r.iterations,
    0,
  );

  const metrics: ProcessDataMetrics = {
    phase: lastPhase,
    duration_ms: durationMs,
    harness_pass_rate: Math.round(harnessPassRate * 10000) / 10000,
    task_completion_rate: Math.round(taskCompletionRate * 10000) / 10000,
    deviation_count: deviationCount,
    convergence_iterations: convergenceIterations,
  };

  // Validate output shape
  return processDataMetricsSchema.parse(metrics);
};

// ─── CLI Entry ───────────────────────────────────────────────────────────

const parseContextPath = (argv: string[]): string | null => {
  for (const arg of argv) {
    if (arg.startsWith("--context=")) {
      return arg.slice("--context=".length);
    }
  }
  return null;
};

if (import.meta.main) {
  const contextPath = parseContextPath(Bun.argv);

  if (!contextPath) {
    process.stderr.write(
      "Usage: bun src/process-data/compute.ts --context=<path>\n",
    );
    process.exit(1);
  }

  try {
    const file = Bun.file(contextPath);
    const exists = await file.exists();
    if (!exists) {
      process.stderr.write(`Error: File not found: ${contextPath}\n`);
      process.exit(1);
    }

    const raw = await file.json();
    const metrics = computeMetrics(raw);

    // Write metrics to stdout
    const metricsJson = JSON.stringify(metrics);
    process.stdout.write(metricsJson + "\n");

    // Store in state.json via luca-bridge
    try {
      await Bun.$`luca-bridge set-field --field=process_data_metrics --value=${metricsJson}`
        .quiet()
        .nothrow();
    } catch {
      // Graceful degradation — bridge may not be available
      process.stderr.write(
        "WARN: Could not write metrics to state via bridge\n",
      );
    }

    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  }
}
