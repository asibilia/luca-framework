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

/**
 * Available consensus resolution modes.
 *
 * - unanimous: all perspectives must agree
 * - majority: more than required_agreement threshold must agree
 * - supermajority: uses required_agreement as threshold (e.g., 0.67)
 * - expert_weighted: expert agents' votes count double, then apply majority
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
 * Configuration for consensus resolution.
 *
 * Controls how perspectives are weighted, what threshold is required,
 * and what happens when no consensus is reached.
 */
export const ConsensusConfigSchema = z.object({
  /** Resolution strategy */
  mode: consensusModeSchema.default("majority"),
  /** Agreement threshold (0.0 - 1.0). For majority, default 0.5 means >50%. */
  required_agreement: z.number().min(0).max(1).default(0.5),
  /** Agent names whose votes count double in expert_weighted mode */
  expert_agents: z.array(z.string()).default([]),
  /** Strategy when no mode produces consensus */
  fallback_strategy: z
    .enum(["highest_confidence", "halt", "escalate"])
    .default("highest_confidence"),
  /** Minimum number of perspectives required for valid consensus */
  min_perspectives: z.number().int().positive().default(2),
});

export type ConsensusConfig = z.infer<typeof ConsensusConfigSchema>;

/**
 * Fallback strategies for when consensus cannot be reached.
 */
export const FALLBACK_STRATEGIES = [
  "highest_confidence",
  "halt",
  "escalate",
] as const;

export type FallbackStrategy = (typeof FALLBACK_STRATEGIES)[number];
