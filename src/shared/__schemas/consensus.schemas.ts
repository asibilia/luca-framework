/**
 * Zod schemas for configurable consensus resolution.
 *
 * Extends the tribunal system with multiple resolution strategies
 * beyond the original 3-perspective majority vote.
 *
 * Uses snake_case for API schema compatibility.
 * T0-compliant: imports nothing from src/.
 */
import { z } from "zod";

// ─── Consensus Type ──────────────────────────────────────────────────────────

/**
 * Available consensus resolution modes (types).
 *
 * - unanimous: all perspectives must agree
 * - majority: more than required_agreement threshold must agree
 * - supermajority: uses required_agreement as threshold (e.g., 0.67)
 * - expert_weighted: expert agents' votes count by multiplier, then apply majority
 */
export const CONSENSUS_MODES = [
  "unanimous",
  "majority",
  "supermajority",
  "expert_weighted",
] as const;

export const consensusModeSchema = z.enum(CONSENSUS_MODES);
export type ConsensusMode = z.infer<typeof consensusModeSchema>;

/**
 * Alias for consensusModeSchema.
 *
 * Provides a named export matching the plan's terminology
 * (ConsensusTypeSchema) while reusing the existing enum.
 */
export const ConsensusTypeSchema = consensusModeSchema;
export type ConsensusType = ConsensusMode;

// ─── Fallback Strategy ───────────────────────────────────────────────────────

/**
 * Fallback strategies for when consensus cannot be reached.
 *
 * - accept_all: accept all findings regardless of disagreement
 * - reject_all: reject all findings when no consensus
 * - defer_to_expert: use the expert agent's vote as the final decision
 * - escalate_to_human: flag for human review
 * - highest_confidence: pick the perspective with the highest confidence
 * - halt: stop processing entirely
 * - escalate: (legacy) synonym for escalate_to_human
 */
export const FALLBACK_STRATEGIES = [
  "accept_all",
  "reject_all",
  "defer_to_expert",
  "escalate_to_human",
  "highest_confidence",
  "halt",
  "escalate",
] as const;

export const ConsensusFallbackStrategySchema = z.enum(FALLBACK_STRATEGIES);
export type ConsensusFallbackStrategy = z.infer<
  typeof ConsensusFallbackStrategySchema
>;

/**
 * Legacy alias — the original fallback strategies enum type.
 */
export type FallbackStrategy = ConsensusFallbackStrategy;

// ─── Consensus Config ────────────────────────────────────────────────────────

/**
 * Configuration for consensus resolution.
 *
 * Controls how perspectives are weighted, what threshold is required,
 * and what happens when no consensus is reached.
 *
 * Uses snake_case for API schema compatibility.
 */
export const ConsensusConfigSchema = z.object({
  /** Resolution strategy */
  mode: consensusModeSchema.default("majority"),
  /** Agreement threshold (0.0 - 1.0). For majority, default 0.5 means >50%. */
  required_agreement: z.number().min(0).max(1).default(0.5),
  /** Agent names whose votes carry extra weight in expert_weighted mode */
  expert_agents: z.array(z.string()).default([]),
  /** Multiplier applied to expert agent votes in expert_weighted mode */
  expert_weight_multiplier: z.number().positive().default(2.0),
  /** Strategy when no mode produces consensus */
  fallback_strategy: ConsensusFallbackStrategySchema.default("defer_to_expert"),
  /** Minimum number of perspectives required for valid consensus */
  min_perspectives: z.number().int().positive().default(2),
});

export type ConsensusConfig = z.infer<typeof ConsensusConfigSchema>;

// ─── Consensus Result ────────────────────────────────────────────────────────

/**
 * Structured result of a consensus resolution round.
 *
 * Captures the resolution mode used, vote tallies, agreement score,
 * and whether a fallback strategy was applied.
 *
 * Uses snake_case for API schema compatibility.
 */
export const ConsensusResultSchema = z.object({
  /** The consensus mode that produced this result */
  type_used: consensusModeSchema,
  /** Agreement score (0.0 - 1.0): votes_for / total effective votes */
  agreement_score: z.number().min(0).max(1),
  /** Number of effective votes in favour of the consensus category */
  votes_for: z.number().nonnegative(),
  /** Number of effective votes against the consensus category */
  votes_against: z.number().nonnegative(),
  /** Number of votes cast by expert agents (before multiplier) */
  expert_votes: z.number().int().nonnegative().default(0),
  /** Whether the required agreement threshold was met */
  consensus_reached: z.boolean(),
  /** Whether a fallback strategy was applied */
  fallback_used: z.boolean(),
  /** Which fallback strategy was applied (only set when fallback_used is true) */
  fallback_strategy_applied: ConsensusFallbackStrategySchema.optional(),
});

export type ConsensusResult = z.infer<typeof ConsensusResultSchema>;
