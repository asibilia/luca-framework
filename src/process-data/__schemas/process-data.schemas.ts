import { z } from "zod";

/**
 * Schema for a single harness run entry in state context.
 *
 * Uses snake_case for data schema compatibility.
 */
export const harnessRunSchema = z.object({
  /** Whether the harness run passed */
  passed: z.boolean().default(false),
  /** Number of fix iterations consumed */
  iterations: z.number().int().nonnegative().default(0),
});
export type HarnessRun = z.infer<typeof harnessRunSchema>;

/**
 * Schema for a single task entry in state context.
 *
 * Uses snake_case for data schema compatibility.
 */
export const taskEntrySchema = z.object({
  /** Task completion status */
  status: z.string().default("pending"),
  /** Whether the task deviated from the plan */
  deviated: z.boolean().default(false),
});
export type TaskEntry = z.infer<typeof taskEntrySchema>;

/**
 * Schema for the input context file read by the compute module.
 *
 * Accepts the full state.json shape but only parses the fields
 * the compute module needs. Uses `.passthrough()` so unknown
 * fields are preserved without validation errors.
 *
 * Uses snake_case for data schema compatibility.
 */
export const processDataInputSchema = z
  .object({
    /** Phase identifier (from context or top-level) */
    context: z
      .object({
        /** ISO timestamp when the session/phase started */
        started_at: z.string().optional(),
        /** ISO timestamp of last state update */
        last_transition_at: z.string().optional(),
        /** Array of harness run results */
        harness_runs: z.array(harnessRunSchema).optional(),
        /** Array of task entries */
        tasks: z.array(taskEntrySchema).optional(),
        /** Phase results array for phase ID extraction */
        phase_results: z.array(z.any()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
export type ProcessDataInput = z.infer<typeof processDataInputSchema>;

/**
 * Schema for the computed process-data metrics output.
 *
 * This is the JSON shape emitted to stdout and stored in
 * state.json under `process_data_metrics`.
 *
 * Uses snake_case for data schema compatibility.
 */
export const processDataMetricsSchema = z.object({
  /** Phase identifier string */
  phase: z.string(),
  /** Duration in milliseconds between started_at and last_transition_at */
  duration_ms: z.number().int().nonnegative(),
  /** Ratio of passed harness runs to total runs (0.0 - 1.0) */
  harness_pass_rate: z.number().min(0).max(1),
  /** Ratio of completed tasks to total tasks (0.0 - 1.0) */
  task_completion_rate: z.number().min(0).max(1),
  /** Count of tasks that deviated from the plan */
  deviation_count: z.number().int().nonnegative(),
  /** Total harness fix loop iterations across all runs */
  convergence_iterations: z.number().int().nonnegative(),
});
export type ProcessDataMetrics = z.infer<typeof processDataMetricsSchema>;
