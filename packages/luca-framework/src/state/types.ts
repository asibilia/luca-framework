/**
 * Type definitions for the Luca workflow state machine.
 *
 * Defines WorkflowContext, WorkflowEvent, and supporting types as Zod schemas.
 * These are the single source of truth for all data flowing through the machine.
 *
 * Uses snake_case for all schema field names per API conventions.
 */
import { z } from "zod";
import get from "lodash/get";

// ─── Result Type ────────────────────────────────────────────────────────────

/**
 * Discriminated union for operation results.
 *
 * Used by persistence functions for success/failure returns.
 *
 * @example
 * ```typescript
 * function parseConfig(input: string): Result<Config> {
 *   try {
 *     const data = JSON.parse(input);
 *     return { success: true, data };
 *   } catch (error) {
 *     return { success: false, error: error.message };
 *   }
 * }
 * ```
 */
export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ─── Workflow States ──────────────────────────────────────────────────────────

/** All possible workflow states */
export const WORKFLOW_STATES = [
  "idle",
  "preflight",
  "routing",
  "discussing",
  "planning",
  "executing",
  "verifying",
  "learning",
  "committing",
  "complete",
  "paused",
  "suspended",
  "failed",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

// ─── Oversight Levels ─────────────────────────────────────────────────────────

/** Oversight levels controlling human-in-the-loop gates */
export const OVERSIGHT_LEVELS = [
  "full-auto",
  "milestone",
  "phase",
  "plan",
] as const;
export const oversightLevelSchema = z.enum(OVERSIGHT_LEVELS);
export type OversightLevel = z.infer<typeof oversightLevelSchema>;

// ─── Complexity Level (Zod Schema) ───────────────────────────────────────────

/**
 * Complexity level schema for Zod validation.
 * Re-declared here for JSON-serializable context usage.
 */
export const complexityLevelSchema = z.enum([
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
]);

// ─── Phase Result ─────────────────────────────────────────────────────────────

/**
 * Result of a completed phase execution.
 *
 * Uses snake_case for API compatibility.
 */
export const phaseResultSchema = z.object({
  phase_id: z.number().int(),
  status: z.enum(["passed", "failed", "blocked"]),
  summary: z.string().default(""),
  errors: z.array(z.string()).default([]),
  duration_ms: z.number().int().nonnegative().default(0),
  timestamp: z.string().default(""),
});
export type PhaseResult = z.infer<typeof phaseResultSchema>;

// ─── Harness Result Ref ───────────────────────────────────────────────────────

/**
 * JSON-serializable reference to a harness result.
 *
 * A subset of the full HarnessResult for context storage.
 * Uses snake_case for API compatibility.
 */
export const harnessResultRefSchema = z.object({
  status: z.enum(["passed", "failed"]),
  total_errors: z.number().int().nonnegative(),
  total_warnings: z.number().int().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  timestamp: z.string(),
});
export type HarnessResultRef = z.infer<typeof harnessResultRefSchema>;

// ─── Budget State Ref ─────────────────────────────────────────────────────────

/**
 * JSON-serializable budget state for context storage.
 *
 * Re-declared for JSON-serializable context. The full BudgetState
 * from iteration/types.ts is used by the budget module directly.
 * Uses snake_case for API compatibility.
 */
export const budgetStateRefSchema = z.object({
  max_iterations: z.number().int().positive(),
  current_iteration: z.number().int().nonnegative(),
  soft_stop_percent: z.number().min(0).max(100).default(80),
  status: z.enum(["under_budget", "soft_stop", "exceeded"]),
});
export type BudgetStateRef = z.infer<typeof budgetStateRefSchema>;

// ─── Workflow Context ─────────────────────────────────────────────────────────

/**
 * The complete context for the workflow state machine.
 *
 * Contains all state the machine tracks across transitions:
 * identity, classification, configuration, execution tracking,
 * iteration budgets, cognitive/memory, and timestamps.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const workflowContextSchema = z.object({
  // Identity
  session_id: z.string(),
  ticket_id: z.string().optional(),
  github_issue: z.number().int().optional(),
  branch: z.string().optional(),
  base_branch: z.string().default("main"),

  // Workflow position
  current_milestone: z.string().optional(),
  current_phase: z.number().int().optional(),
  current_plan_ids: z.array(z.string()).default([]),
  current_wave_count: z.number().int().nonnegative().default(0),

  // Classification
  complexity: complexityLevelSchema.default("TRIVIAL"),
  oversight: oversightLevelSchema.default("milestone"),

  // Configuration (loaded from config.json at init)
  gates: z.record(z.string(), z.boolean()).default({}),
  workflow_config: z.record(z.string(), z.unknown()).default({}),
  complexity_matrix: z.record(z.string(), z.unknown()).default({}),
  autopilot_config: z.record(z.string(), z.unknown()).default({}),

  // Execution tracking
  phase_results: z.array(phaseResultSchema).default([]),
  harness_result: harnessResultRefSchema.optional(),
  verification_attempts: z.number().int().nonnegative().default(0),
  max_verification_attempts: z.number().int().positive().default(3),

  // Iteration budget
  iteration_budget: budgetStateRefSchema.optional(),

  // Cognitive / memory
  intuition_flags: z.array(z.string()).default([]),
  memory_tags: z.array(z.string()).default([]),
  skip_reason: z.string().optional(),

  // Suspend/resume
  suspend_metadata: z
    .object({
      suspended_at: z.string().optional(),
      reason: z.string().optional(),
      checkpoint_path: z.string().optional(),
      resume_wave_index: z.number().int().nonnegative().optional(),
      completed_task_ids: z.array(z.string()).optional(),
    })
    .optional(),

  // Timestamps
  started_at: z.string().optional(),
  last_transition_at: z.string().optional(),

  // Error tracking
  last_error: z.string().optional(),
});
export type WorkflowContext = z.infer<typeof workflowContextSchema>;

// ─── Workflow Events ──────────────────────────────────────────────────────────

/**
 * Discriminated union of all workflow events.
 *
 * Each event type represents a signal that the machine can react to.
 * The `type` field is the discriminator.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const workflowEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("START"),
    ticket_id: z.string().optional(),
    config_path: z.string().optional(),
  }),
  z.object({
    type: z.literal("PREFLIGHT_COMPLETE"),
    intuition_flags: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal("ROUTE_COMPLETE"),
    complexity: complexityLevelSchema,
  }),
  z.object({
    type: z.literal("DISCUSS_COMPLETE"),
    summary: z.string().default(""),
  }),
  z.object({
    type: z.literal("PLAN_COMPLETE"),
    plan_id: z.string().default(""),
  }),
  z.object({ type: z.literal("PHASE_START"), phase_id: z.number().int() }),
  z.object({
    type: z.literal("PHASE_COMPLETE"),
    phase_id: z.number().int(),
    summary: z.string().default(""),
  }),
  z.object({
    type: z.literal("PHASE_FAILED"),
    phase_id: z.number().int(),
    error: z.string().default(""),
  }),
  z.object({
    type: z.literal("HARNESS_COMPLETE"),
    status: z.enum(["passed", "failed"]),
    total_errors: z.number().int().nonnegative().default(0),
  }),
  z.object({ type: z.literal("VERIFY_PASSED") }),
  z.object({
    type: z.literal("VERIFY_FAILED"),
    gaps: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal("VERIFY_HALTED"),
    reason: z.string().default(""),
  }),
  z.object({
    type: z.literal("LEARN_COMPLETE"),
    learnings: z.array(z.string()).default([]),
  }),
  z.object({
    type: z.literal("COMMIT_COMPLETE"),
    commit_hash: z.string().default(""),
  }),
  z.object({ type: z.literal("SKIP"), reason: z.string().default("") }),
  z.object({ type: z.literal("RESUME") }),
  z.object({
    type: z.literal("SUSPEND"),
    reason: z.string().optional(),
    checkpoint_id: z.string().optional(),
  }),
  z.object({
    type: z.literal("RESUME_PHASE"),
    checkpoint_id: z.string().optional(),
  }),
  z.object({ type: z.literal("ABORT"), reason: z.string().default("") }),
  z.object({ type: z.literal("RESET") }),
]);

/**
 * TypeScript union type for all workflow events.
 * Used as the `events` type in XState setup().
 */
export type WorkflowEvent = z.infer<typeof workflowEventSchema>;

// ─── Phase Actor States ──────────────────────────────────────────────────────

/** All possible phase actor states */
export const PHASE_ACTOR_STATES = [
  "idle",
  "wave_executing",
  "wave_evaluating",
  "phase_verifying",
  "phase_fixing",
  "phase_done",
  "phase_blocked",
] as const;
export type PhaseActorState = (typeof PHASE_ACTOR_STATES)[number];

// ─── Phase Actor Events ─────────────────────────────────────────────────────

/** All phase actor event type strings */
export const PHASE_EVENTS = [
  "PLAN_WAVE",
  "WAVE_COMPLETE",
  "WAVE_FAILED",
  "HARNESS_PASSED",
  "HARNESS_FAILED",
  "FIX_COMPLETE",
  "FIX_FAILED",
] as const;

// ─── Wave Result ─────────────────────────────────────────────────────────────

/**
 * Result of a single wave execution within a phase.
 *
 * Uses snake_case for API compatibility.
 */
export const waveResultSchema = z.object({
  wave_number: z.number().int().nonnegative(),
  plan_ids: z.array(z.string()).default([]),
  status: z.enum(["passed", "failed", "skipped"]),
  summary: z.string().default(""),
  timestamp: z.string().default(""),
});
export type WaveResult = z.infer<typeof waveResultSchema>;

// ─── Phase Context ───────────────────────────────────────────────────────────

/**
 * Context for the phase actor child machine.
 *
 * Tracks wave execution progress, harness verification, and fix iterations
 * within a single phase lifecycle.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const phaseContextSchema = z.object({
  phase_id: z.number().int(),
  plan_ids: z.array(z.string()).default([]),
  current_wave: z.number().int().nonnegative().default(0),
  total_waves: z.number().int().positive().default(1),
  wave_results: z.array(waveResultSchema).default([]),
  fix_iterations: z.number().int().nonnegative().default(0),
  max_fix_iterations: z.number().int().positive().default(3),
  harness_passed: z.boolean().default(false),
  last_harness_errors: z.array(z.string()).default([]),
  outcome: z
    .enum(["pending", "passed", "failed", "blocked"])
    .default("pending"),
  outcome_reason: z.string().default(""),
  timestamps: z
    .object({
      started_at: z.string().optional(),
      completed_at: z.string().optional(),
    })
    .default({}),
});
export type PhaseContext = z.infer<typeof phaseContextSchema>;

// ─── Phase Input ─────────────────────────────────────────────────────────────

/**
 * Input to start a phase actor instance.
 *
 * Provided by the parent machine when invoking the phase actor.
 * Uses snake_case for API compatibility.
 */
export const phaseInputSchema = z.object({
  phase_id: z.number().int(),
  plan_ids: z.array(z.string()).default([]),
  total_waves: z.number().int().positive().default(1),
  max_fix_iterations: z.number().int().positive().default(3),
});
export type PhaseInput = z.infer<typeof phaseInputSchema>;

// ─── Phase Events ────────────────────────────────────────────────────────────

/**
 * Discriminated union of all phase actor events.
 *
 * Each event type represents a signal the phase actor reacts to
 * during wave execution, harness verification, and fix iterations.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const phaseEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PLAN_WAVE") }),
  z.object({
    type: z.literal("WAVE_COMPLETE"),
    wave_number: z.number().int().nonnegative(),
    summary: z.string().default(""),
  }),
  z.object({
    type: z.literal("WAVE_FAILED"),
    wave_number: z.number().int().nonnegative(),
    error: z.string().default(""),
  }),
  z.object({ type: z.literal("HARNESS_PASSED") }),
  z.object({
    type: z.literal("HARNESS_FAILED"),
    error_count: z.number().int().nonnegative().default(0),
  }),
  z.object({
    type: z.literal("FIX_COMPLETE"),
    summary: z.string().default(""),
  }),
  z.object({
    type: z.literal("FIX_FAILED"),
    error: z.string().default(""),
  }),
]);
export type PhaseEvent = z.infer<typeof phaseEventSchema>;

// ─── Transition Record ───────────────────────────────────────────────────────

/**
 * Structured record of a state machine transition.
 *
 * Emitted by the CLI `send` command for event-driven architecture.
 * Contains a minimal context summary (not the full context) to
 * keep the record lightweight.
 *
 * Uses snake_case for all properties per API conventions.
 */
export const transitionRecordSchema = z.object({
  previous_state: z.string(),
  current_state: z.string(),
  event_type: z.string(),
  event_data: z.record(z.string(), z.unknown()).default({}),
  actions_executed: z.array(z.string()).default([]),
  context: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string().default(""),
  session_id: z.string().default(""),
});
export type TransitionRecord = z.infer<typeof transitionRecordSchema>;

// ─── Context Factory ──────────────────────────────────────────────────────────

/**
 * Create a fresh workflow context with defaults.
 *
 * Merges optional partial context overrides with Zod-validated defaults.
 * The optional `config` object maps directly to the structure of
 * .planning/config.json sections.
 *
 * @param input - Optional partial context overrides and config
 * @returns Validated WorkflowContext with all defaults applied
 *
 * @example
 * ```typescript
 * const ctx = initializeContext({
 *   ticket_id: "PROJ-1234",
 *   config: {
 *     gates: { confirm_plan: true },
 *     autopilot: { oversight: "full-auto" },
 *   },
 * });
 * ```
 */
export function initializeContext(
  input?: Partial<WorkflowContext> & { config?: Record<string, unknown> },
): WorkflowContext {
  const config = input?.config ?? {};
  // Internal construction — .parse() validates shape, data is computed (not external input).
  // Spread all input fields first so callers (including tests) can override any context field,
  // then apply config-derived defaults for fields that weren't explicitly provided.
  const { config: _config, ...inputFields } = input ?? {};
  return workflowContextSchema.parse({
    session_id: crypto.randomUUID(),
    started_at: new Date().toISOString(),
    ...inputFields,
    // Config-derived fields: only apply if not explicitly provided in input
    oversight:
      input?.oversight ?? get(config, "autopilot.oversight") ?? "milestone",
    gates: get(config, "gates") ?? input?.gates ?? {},
    workflow_config: get(config, "workflow") ?? input?.workflow_config ?? {},
    complexity_matrix:
      get(config, "complexity.matrix") ?? input?.complexity_matrix ?? {},
    autopilot_config: get(config, "autopilot") ?? input?.autopilot_config ?? {},
  });
}
