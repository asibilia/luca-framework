import { z } from "zod";

/**
 * Observer-local type definitions.
 *
 * ## Schema Coupling Policy
 *
 * Several schemas in this file are intentional observer-local mirrors of
 * schemas defined in `packages/luca-framework/src/state/` and
 * `packages/luca-framework/src/harness/`. They are duplicated — NOT imported —
 * to avoid a cross-package runtime dependency between luca-observer (Next.js app)
 * and luca-framework (Node/Bun CLI tool).
 *
 * **When luca-framework schemas change**, the corresponding observer-local mirrors
 * must be updated manually:
 * - `LedgerEntrySchema` mirrors `ledger.ts::ledgerEntrySchema`
 * - `HarnessResultSnapshotSchema` mirrors `harness.schemas.ts::HarnessResultSchema`
 *   (with snake_case field names; the original uses camelCase for internal use)
 * - `IterationRecordSnapshotSchema` mirrors luca-framework iteration schemas
 * - `SessionPlanSnapshotSchema` mirrors luca-framework planner schemas
 * - `TribunalResultSnapshotSchema` mirrors luca-framework tribunal schemas
 *
 * All observer-local schemas use snake_case for API compatibility, even when
 * the source schema uses camelCase for internal TypeScript use.
 *
 * @see packages/luca-framework/src/state/ledger.ts
 * @see packages/luca-framework/src/harness/__schemas/harness.schemas.ts
 */

/**
 * API Request: Observer event ingestion payload.
 *
 * Received from Luca hooks via HTTP POST.
 * Uses snake_case for API compatibility.
 */
export const ObserverEventSchema = z.object({
  event_type: z.string(),
  event_subtype: z.string().optional(),
  session_id: z.string().optional(),
  timestamp: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  agent_name: z.string().optional(),
  tool_name: z.string().optional(),
  file_path: z.string().optional(),
  duration_ms: z.number().optional(),
  status: z.string().optional(),
  phase_id: z.number().optional(),
  complexity: z.string().optional(),
});

export type ObserverEvent = z.infer<typeof ObserverEventSchema>;

/**
 * Internal type: Stored event with auto-generated fields.
 */
export const StoredEventSchema = ObserverEventSchema.extend({
  id: z.number(),
  timestamp_ms: z.number(),
});

export type StoredEvent = z.infer<typeof StoredEventSchema>;

/**
 * Internal type: Session record.
 */
export const SessionRecordSchema = z.object({
  id: z.string(),
  started_at: z.string(),
  ended_at: z.string().optional(),
  ticket_id: z.string().optional(),
  branch: z.string().optional(),
  complexity: z.string().optional(),
  status: z.string().default("active"),
  total_events: z.number().default(0),
  metadata: z.record(z.unknown()).default({}),
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

/**
 * API Response: Event ingestion acknowledgment.
 *
 * Uses snake_case for API compatibility.
 */
export const EventResponseSchema = z.object({
  id: z.number(),
  received: z.boolean(),
});

export type EventResponse = z.infer<typeof EventResponseSchema>;

/**
 * Workflow state snapshot (read from .planning/STATE.md or bridge).
 */
export const WorkflowSnapshotSchema = z.object({
  workflow_state: z.string().default("idle"),
  current_phase: z.number().default(0),
  current_plan: z.string().default(""),
  complexity: z.string().default("MODERATE"),
  oversight: z.string().default("milestone"),
  ticket_id: z.string().default(""),
  branch: z.string().default(""),
  session_id: z.string().default(""),
  errors: z.array(z.string()).default([]),
});

export type WorkflowSnapshot = z.infer<typeof WorkflowSnapshotSchema>;

// ─── Ledger Entry Schema ─────────────────────────────────────────────────────

// NOTE: Observer-local mirror of luca-framework's LedgerEntry
/**
 * Observer-local mirror of luca-framework's TransitionRecord + LedgerEntry.
 *
 * Represents a single state machine transition recorded in session-ledger.jsonl.
 * Locally defined to avoid cross-package dependency.
 *
 * Source: packages/luca-framework/src/state/ledger.ts::ledgerEntrySchema
 * Differences: none — field names and types are identical.
 * Update this schema when the source schema changes.
 *
 * Uses snake_case for API compatibility.
 */
export const LedgerEntrySchema = z.object({
  previous_state: z.string(),
  current_state: z.string(),
  event_type: z.string(),
  event_data: z.record(z.unknown()).default({}),
  actions_executed: z.array(z.string()).default([]),
  context: z.record(z.unknown()).default({}),
  timestamp: z.string().default(""),
  session_id: z.string().default(""),
  sequence_number: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative().nullable().default(null),
});

export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

// ─── Harness Result Snapshot Schemas ─────────────────────────────────────────

// NOTE: Observer-local mirrors of luca-framework's harness check schemas (snake_case fields)
/**
 * Observer-local mirror of luca-framework's ParsedError.
 *
 * A single parsed error from toolchain output.
 *
 * Source: packages/luca-framework/src/harness/__schemas/harness.schemas.ts::parsedErrorSchema
 * Differences: field names identical; source uses camelCase internally but these match API output.
 * Update this schema when the source schema changes.
 *
 * Uses snake_case for API compatibility.
 */
export const ParsedErrorSnapshotSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  message: z.string(),
  code: z.string().optional(),
  severity: z.enum(["error", "warning"]),
});

export type ParsedErrorSnapshot = z.infer<typeof ParsedErrorSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's CheckResult.
 *
 * Result of a single harness check (test, typecheck, lint, build).
 *
 * Source: packages/luca-framework/src/harness/__schemas/harness.schemas.ts::checkResultSchema
 * Differences: uses snake_case (source may use camelCase for internal TypeScript types).
 * Update this schema when the source schema changes.
 *
 * Uses snake_case for API compatibility.
 */
export const CheckResultSnapshotSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped", "timeout"]),
  exit_code: z.number().int(),
  errors: z.array(ParsedErrorSnapshotSchema).default([]),
  warnings: z.array(ParsedErrorSnapshotSchema).default([]),
  raw_output: z.string().default(""),
  duration: z.number().nonnegative().default(0),
});

export type CheckResultSnapshot = z.infer<typeof CheckResultSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's HarnessResult.
 *
 * Aggregate result of running all harness checks.
 *
 * Source: packages/luca-framework/src/harness/__schemas/harness.schemas.ts::HarnessResultSchema
 * Differences: uses snake_case (source uses camelCase for internal TypeScript types).
 * Update this schema when the source schema changes.
 *
 * Uses snake_case for API compatibility.
 */
export const HarnessResultSnapshotSchema = z.object({
  status: z.enum(["passed", "failed"]),
  checks: z.array(CheckResultSnapshotSchema).default([]),
  total_errors: z.number().int().nonnegative().default(0),
  total_warnings: z.number().int().nonnegative().default(0),
  duration: z.number().nonnegative().default(0),
  timestamp: z.string().default(""),
});

export type HarnessResultSnapshot = z.infer<typeof HarnessResultSnapshotSchema>;

// ─── Iteration Snapshot Schemas ──────────────────────────────────────────────

// NOTE: Observer-local mirrors of luca-framework's iteration schemas
/**
 * Observer-local mirror of luca-framework's ConvergenceSignals.
 *
 * Multi-signal convergence metrics for an iteration.
 *
 * Source: packages/luca-framework/src/iteration/ convergence schemas
 * Update this schema when the source schema changes.
 *
 * Uses snake_case for API compatibility.
 */
export const ConvergenceSignalsSnapshotSchema = z.object({
  error_count_delta: z.number().int(),
  fingerprint_overlap: z.number().min(0).max(1),
  artifact_change_delta: z.number().int().nonnegative(),
  semantic_overlap: z.number().min(0).max(1).optional(),
});

export type ConvergenceSignalsSnapshot = z.infer<
  typeof ConvergenceSignalsSnapshotSchema
>;

/**
 * Observer-local mirror of luca-framework's IterationRecord.
 *
 * A single iteration checkpoint with error counts, convergence status,
 * and classification breakdown.
 * Uses snake_case for API compatibility.
 */
export const IterationRecordSnapshotSchema = z.object({
  tag: z.string(),
  phase: z.number().int().positive(),
  loop: z.enum(["harness", "verify"]),
  iteration: z.number().int().positive(),
  error_count: z.number().int().nonnegative(),
  error_delta: z.number().int(),
  convergence_status: z.enum(["improved", "stalled", "regressed"]),
  stale_count: z.number().int().nonnegative(),
  permanent_errors: z.array(z.string()).default([]),
  correctable_errors: z.array(z.string()).default([]),
  transient_errors: z.array(z.string()).default([]),
  artifacts_delta: z.number().int().nonnegative(),
  agent_invoked: z.string(),
  duration_ms: z.number().int().nonnegative(),
  timestamp: z.string(),
});

export type IterationRecordSnapshot = z.infer<
  typeof IterationRecordSnapshotSchema
>;

/**
 * Observer-local mirror of luca-framework's BudgetState.
 *
 * Budget tracking for an iteration loop.
 * Uses snake_case for API compatibility.
 */
export const BudgetStateSnapshotSchema = z.object({
  max_iterations: z.number().int().positive(),
  current_iteration: z.number().int().nonnegative(),
  soft_stop_percent: z.number().min(0).max(100).default(80),
  status: z.enum(["under_budget", "soft_stop", "exceeded"]),
});

export type BudgetStateSnapshot = z.infer<typeof BudgetStateSnapshotSchema>;

// ─── Planning Snapshot Schemas ───────────────────────────────────────────────

// NOTE: Observer-local mirrors of luca-framework's planner schemas
/**
 * Observer-local mirror of luca-framework's WSJFScoredItem.
 *
 * A todo item with computed WSJF score.
 *
 * Source: packages/luca-framework/src/planner/ WSJF schemas
 * Update this schema when the source schema changes.
 *
 * Uses snake_case for API compatibility.
 */
export const WSJFScoredItemSnapshotSchema = z.object({
  todo_path: z.string(),
  title: z.string(),
  area: z.string(),
  wsjf_score: z.number().nonnegative(),
  complexity: z.string(),
  dependency_free: z.boolean(),
  assigned_zone: z.enum(["peak", "good", "degrading", "stop"]).optional(),
});

export type WSJFScoredItemSnapshot = z.infer<
  typeof WSJFScoredItemSnapshotSchema
>;

/**
 * Observer-local mirror of luca-framework's SessionPlan.
 *
 * A session plan with WSJF-ordered items.
 * Uses snake_case for API compatibility.
 */
export const SessionPlanSnapshotSchema = z.object({
  generated_at: z.string(),
  session_cap_minutes: z.number().int().positive().default(180),
  total_effort_points: z.number().int().nonnegative(),
  items: z.array(WSJFScoredItemSnapshotSchema),
  big_rock_index: z.number().int().nonnegative().optional(),
  rationale: z.string(),
});

export type SessionPlanSnapshot = z.infer<typeof SessionPlanSnapshotSchema>;

// ─── Tribunal Snapshot Schemas ───────────────────────────────────────────────

// NOTE: Observer-local mirrors of luca-framework's tribunal/code-review schemas
/**
 * Observer-local mirror of luca-framework's ReviewFinding.
 *
 * A single finding from a code reviewer agent.
 *
 * Source: packages/luca-framework/src/ tribunal/code-review schemas
 * Update this schema when the source schema changes.
 *
 * Uses snake_case for API compatibility.
 */
export const ReviewFindingSnapshotSchema = z.object({
  id: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  file: z.string(),
  line: z.number().int().nonnegative().default(0),
  issue: z.string(),
  suggestion: z.string().default(""),
  source_agent: z.string(),
});

export type ReviewFindingSnapshot = z.infer<typeof ReviewFindingSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's Disagreement.
 *
 * A detected conflict between reviewer findings.
 * Uses snake_case for API compatibility.
 */
export const DisagreementSnapshotSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number().int().nonnegative(),
  conflicting_findings: z.array(ReviewFindingSnapshotSchema).min(2),
  conflict_type: z.enum([
    "contradictory",
    "severity_mismatch",
    "scope_overlap",
  ]),
});

export type DisagreementSnapshot = z.infer<typeof DisagreementSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's Rebuttal.
 *
 * A rebuttal record from a debate round.
 * Uses snake_case for API compatibility.
 */
export const RebuttalSnapshotSchema = z.object({
  finding_id: z.string(),
  challenger_agent: z.string(),
  challenge: z.string(),
  defender_response: z.string(),
  resolution: z.enum(["upheld", "withdrawn", "modified"]),
});

export type RebuttalSnapshot = z.infer<typeof RebuttalSnapshotSchema>;

/**
 * Observer-local mirror of luca-framework's TribunalResult.
 *
 * Complete result of a Design Tribunal session.
 * Uses snake_case for API compatibility.
 */
export const TribunalResultSnapshotSchema = z.object({
  phase: z.number().int().positive(),
  total_findings: z.number().int().nonnegative(),
  disagreements_detected: z.number().int().nonnegative(),
  rebuttals_conducted: z.number().int().nonnegative(),
  findings_withdrawn: z.number().int().nonnegative(),
  findings_modified: z.number().int().nonnegative(),
  debate_token_cost: z.number().int().nonnegative().default(0),
  timestamp: z.string(),
});

export type TribunalResultSnapshot = z.infer<
  typeof TribunalResultSnapshotSchema
>;

// ─── Agent Activity Snapshot Schemas ─────────────────────────────────────────

/**
 * Observer-local schema for agent activity summary.
 *
 * Derived from ledger entries filtered by agent-related event data.
 * Uses snake_case for API compatibility.
 */
export const AgentActivitySnapshotSchema = z.object({
  agent_name: z.string(),
  invocation_count: z.number().int().nonnegative(),
  last_invoked_at: z.string().optional(),
  total_duration_ms: z.number().int().nonnegative().default(0),
  events: z
    .array(
      z.object({
        event_type: z.string(),
        timestamp: z.string(),
        duration_ms: z.number().int().nonnegative().optional(),
        status: z.string().optional(),
      }),
    )
    .default([]),
});

export type AgentActivitySnapshot = z.infer<typeof AgentActivitySnapshotSchema>;
