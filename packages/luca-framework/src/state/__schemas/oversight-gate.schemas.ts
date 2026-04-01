/**
 * Oversight Gate Matrix schemas for the /lu orchestrator.
 *
 * Defines the 8 decision points, 4 oversight modes, 3 token profiles,
 * and the gate action result type. These schemas are the single source
 * of truth for the oversight gate matrix specified in Section 6 of the
 * v9.0.0 workflow spec (06-final-workflow.md).
 *
 * Uses snake_case for all schema fields per API conventions.
 *
 * @module luca-state/__schemas/oversight-gate.schemas
 */
import { z } from "zod";

// ─── Oversight Modes ────────────────────────────────────────────────────────

/**
 * The 4 oversight modes controlling human-in-the-loop gates.
 *
 * - full-auto: Minimal human interaction, auto-approve most decisions
 * - flagged: Auto-continue but pause on notable events (updates, parked phases)
 * - milestone: Pause at milestone boundaries but auto-continue within phases
 * - phase: Pause before every phase for explicit user confirmation
 */
export const OVERSIGHT_MODES = [
  "full-auto",
  "flagged",
  "milestone",
  "phase",
] as const;
export const oversightModeSchema = z.enum(OVERSIGHT_MODES);
export type OversightMode = z.infer<typeof oversightModeSchema>;

// ─── Decision Points ────────────────────────────────────────────────────────

/**
 * The 8 decision points where the oversight gate is evaluated.
 *
 * Each corresponds to a specific location in the /lu pipeline where
 * human intervention may be required depending on the oversight mode
 * and token profile.
 */
export const DECISION_POINTS = [
  "milestone_creation",
  "wsjf_roadmap_revision",
  "before_each_phase",
  "phase_gaps",
  "critical_review_findings",
  "drift_detected",
  "milestone_boundary",
  "cross_milestone",
] as const;
export const decisionPointSchema = z.enum(DECISION_POINTS);
export type DecisionPoint = z.infer<typeof decisionPointSchema>;

// ─── Token Profiles ─────────────────────────────────────────────────────────

/**
 * The 3 token profiles controlling ceremony depth.
 *
 * - budget: Minimize token usage, auto-apply where safe
 * - balanced: Default behavior per oversight mode
 * - quality: Maximize thoroughness, pause more often
 */
export const TOKEN_PROFILES = ["budget", "balanced", "quality"] as const;
export const tokenProfileSchema = z.enum(TOKEN_PROFILES);
export type TokenProfile = z.infer<typeof tokenProfileSchema>;

// ─── Gate Actions ───────────────────────────────────────────────────────────

/**
 * Actions the oversight gate can return at a decision point.
 *
 * - continue: Proceed without human interaction
 * - pause: Stop and prompt the user for a decision
 * - auto_create: Automatically create the artifact (milestone)
 * - auto_approve: Automatically approve the change (roadmap revision)
 * - auto_apply: Automatically apply the update (drift correction)
 * - auto_complete: Automatically complete the boundary (milestone)
 * - auto_continue: Automatically continue to the next unit (cross-milestone)
 * - park_continue: Park the item and continue to next phase
 */
export const GATE_ACTIONS = [
  "continue",
  "pause",
  "auto_create",
  "auto_approve",
  "auto_apply",
  "auto_complete",
  "auto_continue",
  "park_continue",
] as const;
export const gateActionSchema = z.enum(GATE_ACTIONS);
export type GateAction = z.infer<typeof gateActionSchema>;

// ─── Gate Result ────────────────────────────────────────────────────────────

/**
 * Result of evaluating an oversight gate at a decision point.
 *
 * Contains the action to take, the reason for the decision, and
 * an optional flag indicating the result was modified by a profile override.
 *
 * Uses snake_case for all fields per API conventions.
 */
export const oversightGateResultSchema = z.object({
  /** The action the orchestrator should take */
  action: gateActionSchema,
  /** Human-readable reason for this decision */
  reason: z.string(),
  /** Whether a token profile modifier overrode the base matrix action */
  profile_override: z.boolean().default(false),
});
export type OversightGateResult = z.infer<typeof oversightGateResultSchema>;

// ─── CLI Input Schema ───────────────────────────────────────────────────────

/**
 * Input schema for the oversight gate CLI entry point.
 *
 * Used when the orchestrator calls the gate evaluator via:
 * `bun src/state/__helpers/oversight-gate.ts --decision=X --oversight=Y --profile=Z`
 *
 * Uses snake_case for all fields per API conventions.
 */
export const oversightGateInputSchema = z.object({
  decision: decisionPointSchema,
  /** Accepts v9.0.0 modes + deprecated "plan" (mapped to "phase" at runtime) */
  oversight: z.enum([...OVERSIGHT_MODES, "plan"]),
  profile: tokenProfileSchema.default("balanced"),
});
export type OversightGateInput = z.infer<typeof oversightGateInputSchema>;
