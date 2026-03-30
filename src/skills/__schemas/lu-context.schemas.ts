/**
 * Shared context file schema for the lu sub-agent chain.
 *
 * All sub-agents (lu-route, lu-configure, lu-backlog, lu-phase-loop)
 * read/write a single JSON file at `/tmp/lu-context.json`. Each sub-agent
 * reads the full context via `readLuContext()`, extends its section, and
 * writes back via `writeLuContext()`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` must be present.
 * Failed `safeParse` = ABORT (sub-agent treats as terminal failure).
 *
 * **Note:** `current_state` is written by the orchestrator to the context file
 * for hook consumption and is tracked in the Zod schema as an optional field.
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 2
 */
import { z } from "zod";

import { createContextHelpers } from "./context-helpers";

// ─── Sub-Skill Output Schemas ───────────────────────────────────────────────

/**
 * Output from lu-route sub-agent (Steps 0-3).
 *
 * Contains parsed request info, git context, cognition status,
 * complexity classification, and routing decision.
 */
export const LuRouteOutputSchema = z.object({
  request_parsed: z.boolean().default(false),
  git_context_loaded: z.boolean().default(false),
  cognition_ran: z.boolean().default(false),
  complexity_level: z.string().default("MODERATE"),
  routing_decision: z.string().default("phase-execute"),
});

export type LuRouteOutput = z.infer<typeof LuRouteOutputSchema>;

/**
 * Output from lu-configure sub-agent (Step 0 config).
 *
 * Contains configuration loading status, override application,
 * and pre-flight validation results.
 */
export const LuConfigureOutputSchema = z.object({
  config_loaded: z.boolean().default(false),
  overrides_applied: z.boolean().default(false),
  pre_flight_complete: z.boolean().default(false),
});

export type LuConfigureOutput = z.infer<typeof LuConfigureOutputSchema>;

/**
 * Output from lu-backlog sub-agent (backlog scan + roadmap revision).
 *
 * Contains todo scanning results, WSJF scoring status, and
 * roadmap revision outcome.
 */
export const LuBacklogOutputSchema = z.object({
  todos_scanned: z.boolean().default(false),
  wsjf_scored: z.boolean().default(false),
  backlog_revised: z.boolean().default(false),
  phases_added: z.number().default(0),
});

export type LuBacklogOutput = z.infer<typeof LuBacklogOutputSchema>;

/**
 * Output from lu-phase-loop sub-agent (phase loop + milestone gate + summary).
 *
 * Contains execution results, milestone gate status, and
 * summary generation status.
 */
export const LuPhaseLoopOutputSchema = z.object({
  phases_executed: z.number().default(0),
  milestone_gate_checked: z.boolean().default(false),
  summary_generated: z.boolean().default(false),
});

export type LuPhaseLoopOutput = z.infer<typeof LuPhaseLoopOutputSchema>;

// ─── Top-Level Context Schema ───────────────────────────────────────────────

/**
 * Top-level schema for the shared lu context file.
 *
 * All sub-agent output sections are optional because they are populated
 * incrementally as each sub-agent completes. The only required field is
 * `context_version` which must be literal `1`.
 *
 * **PREMORTEM Constraint #1:** `context_version: z.literal(1)` is required.
 * Failed safeParse = ABORT.
 */
export const LuContextSchema = z.object({
  context_version: z.literal(1),
  current_state: z.string().optional(),
  completed_states: z.array(z.string()).default([]),
  lu_route: LuRouteOutputSchema.optional(),
  lu_configure: LuConfigureOutputSchema.optional(),
  lu_backlog: LuBacklogOutputSchema.optional(),
  lu_phase_loop: LuPhaseLoopOutputSchema.optional(),
});

export type LuContext = z.infer<typeof LuContextSchema>;

// ─── Context File Path ──────────────────────────────────────────────────────

/** Well-known path for the shared context file (session-ephemeral). */
export const LU_CONTEXT_PATH = "/tmp/lu-context.json";

// ─── Context File Helpers ───────────────────────────────────────────────────

/**
 * Typed read/write helpers for the lu context file.
 *
 * Created via `createContextHelpers` factory. `readLuContext()` validates
 * the file via safeParse — callers MUST check `.success` and treat
 * `success: false` as ABORT per PREMORTEM Constraint #1.
 *
 * `writeLuContext()` deep-merges a typed patch into the existing file.
 * The patch type is `Partial<Omit<LuContext, "context_version">>` with
 * NO `Record<string, unknown>` escape hatch (PREMORTEM R2).
 */
const { read: readLuContext, write: writeLuContext } = createContextHelpers(
  LU_CONTEXT_PATH,
  LuContextSchema,
);
export { readLuContext, writeLuContext };
