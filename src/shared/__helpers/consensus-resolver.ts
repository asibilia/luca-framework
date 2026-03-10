/**
 * Configurable consensus resolution for N perspectives.
 *
 * Generalizes the existing 3-perspective majority vote (tribunal-consensus.ts)
 * to support N perspectives with multiple resolution strategies:
 * unanimous, majority, supermajority, and expert-weighted.
 *
 * The existing resolveMajorityVote function in tribunal-consensus.ts
 * remains unchanged for backward compatibility.
 *
 * T0-compliant: imports nothing from src/ (only local schemas and lodash).
 */
import filter from "lodash/filter";
import orderBy from "lodash/orderBy";

import type { ConsensusConfig } from "../__schemas/consensus.schemas";
import type { ConsensusResult as FlatConsensusResult } from "../__schemas/consensus.schemas";
import { ConsensusConfigSchema } from "../__schemas/consensus.schemas";
import type { VotablePerspective } from "./tribunal-consensus";

/**
 * Result of configurable consensus resolution.
 *
 * @typeParam TCategory - The union of valid category strings
 * @typeParam TPerspective - The full perspective type
 */
export interface ConsensusResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory> =
    VotablePerspective<TCategory>,
> {
  /** The winning category */
  readonly consensus_category: TCategory;
  /** Perspectives that voted for the consensus category */
  readonly consensus_voters: TPerspective[];
  /** Perspectives that dissented from the consensus */
  readonly dissenters: TPerspective[];
  /** Average confidence of agreeing voters, rounded to 2 decimal places */
  readonly consensus_confidence: number;
  /** The mode that produced the consensus */
  readonly mode_used: ConsensusConfig["mode"];
  /** Whether the fallback strategy was applied */
  readonly fallback_applied: boolean;
  /** Total effective votes for the winning category (includes expert multiplier) */
  readonly votes_for: number;
  /** Total effective votes against the winning category */
  readonly votes_against: number;
  /** Number of expert agents that participated in voting */
  readonly expert_votes: number;
  /** Which fallback strategy was applied, if any */
  readonly fallback_strategy_applied?: ConsensusConfig["fallback_strategy"];
}

/**
 * Resolve consensus from N perspectives using configurable strategies.
 *
 * @param perspectives - Array of votable perspectives
 * @param rawConfig - Consensus configuration (defaults applied via schema)
 * @returns ConsensusResult with consensus category, voters, dissenters, and metadata
 *
 * @example
 * ```typescript
 * const result = resolveConsensus(
 *   [
 *     { category_assessment: "bug", confidence: 0.9 },
 *     { category_assessment: "bug", confidence: 0.8 },
 *     { category_assessment: "feature", confidence: 0.7 },
 *   ],
 *   { mode: "majority", required_agreement: 0.5 },
 * );
 * // result.consensus_category === "bug"
 * // result.fallback_applied === false
 * ```
 */
export function resolveConsensus<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  rawConfig?: Partial<ConsensusConfig>,
): ConsensusResult<TCategory, TPerspective> {
  const config = ConsensusConfigSchema.parse(
    rawConfig ?? {},
  ) as ConsensusConfig;

  // Count expert participants (regardless of mode)
  const expertSet = new Set(config.expert_agents);
  const expertVoteCount = countExpertParticipants(perspectives, expertSet);

  // Not enough perspectives: go straight to fallback
  if (perspectives.length < config.min_perspectives) {
    return applyFallback(perspectives, config, expertVoteCount);
  }

  // Count votes per category with optional expert weighting
  const votes = countVotes(perspectives, config);

  // Total effective vote count (includes expert multiplier)
  const totalVotes = [...votes.values()].reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );

  // Try to find consensus based on mode
  const modeResult = tryResolveByMode(votes, totalVotes, config);

  if (modeResult) {
    const consensusVoters = modeResult.voters;
    const dissenters = filter(
      perspectives,
      (p) => p.category_assessment !== modeResult.category,
    );
    const votesFor = modeResult.weight;
    const votesAgainst = totalVotes - votesFor;

    return {
      consensus_category: modeResult.category as TCategory,
      consensus_voters: consensusVoters as TPerspective[],
      dissenters,
      consensus_confidence: roundTo2(averageConfidence(consensusVoters)),
      mode_used: config.mode,
      fallback_applied: false,
      votes_for: votesFor,
      votes_against: votesAgainst,
      expert_votes: expertVoteCount,
    };
  }

  // No consensus reached by the configured mode
  return applyFallback(perspectives, config, expertVoteCount);
}

/**
 * Convert a generic ConsensusResult into the flat Zod-schema ConsensusResult
 * shape suitable for embedding in tribunalResultSchema.
 *
 * @param result - The generic typed consensus result
 * @returns A plain object matching ConsensusResultSchema
 */
export function toFlatConsensusResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(result: ConsensusResult<TCategory, TPerspective>): FlatConsensusResult {
  const totalVotes = result.votes_for + result.votes_against;
  const agreementScore =
    totalVotes > 0 ? roundTo2(result.votes_for / totalVotes) : 0;

  return {
    type_used: result.mode_used,
    agreement_score: agreementScore,
    votes_for: result.votes_for,
    votes_against: result.votes_against,
    expert_votes: result.expert_votes,
    consensus_reached: !result.fallback_applied,
    fallback_used: result.fallback_applied,
    fallback_strategy_applied: result.fallback_strategy_applied,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface VoteEntry<TPerspective> {
  readonly voters: TPerspective[];
  readonly weight: number;
}

/**
 * Count how many perspectives come from expert agents.
 */
function countExpertParticipants<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(perspectives: TPerspective[], expertSet: Set<string>): number {
  if (expertSet.size === 0) return 0;

  let count = 0;
  for (const perspective of perspectives) {
    if (
      "agent" in perspective &&
      expertSet.has((perspective as Record<string, unknown>).agent as string)
    ) {
      count++;
    }
  }
  return count;
}

function countVotes<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
): Map<string, VoteEntry<TPerspective>> {
  const expertSet = new Set(config.expert_agents);
  const isExpertMode = config.mode === "expert_weighted";
  const multiplier = config.expert_weight_multiplier;

  const votes = new Map<string, VoteEntry<TPerspective>>();

  for (const perspective of perspectives) {
    const category = perspective.category_assessment;
    const existing = votes.get(category);
    const isExpert =
      isExpertMode &&
      "agent" in perspective &&
      expertSet.has((perspective as Record<string, unknown>).agent as string);
    const voteWeight = isExpert ? multiplier : 1;

    if (existing) {
      (existing.voters as TPerspective[]).push(perspective);
      (existing as { weight: number }).weight += voteWeight;
    } else {
      votes.set(category, { voters: [perspective], weight: voteWeight });
    }
  }

  return votes;
}

function tryResolveByMode<TPerspective>(
  votes: Map<string, VoteEntry<TPerspective>>,
  totalVotes: number,
  config: ConsensusConfig,
): { category: string; voters: TPerspective[]; weight: number } | undefined {
  switch (config.mode) {
    case "unanimous": {
      // All perspectives must agree (single category)
      if (votes.size === 1) {
        const [category, entry] = [...votes.entries()][0]!;
        return { category, voters: entry.voters, weight: entry.weight };
      }
      return undefined;
    }

    case "majority":
    case "supermajority":
    case "expert_weighted": {
      // Find categories that meet the threshold
      const threshold = config.required_agreement;

      // Sort by weight descending for deterministic results
      const sorted = orderBy(
        [...votes.entries()],
        ([, entry]) => entry.weight,
        "desc",
      );

      for (const [category, entry] of sorted) {
        const ratio = entry.weight / totalVotes;
        if (ratio > threshold) {
          return { category, voters: entry.voters, weight: entry.weight };
        }
      }

      return undefined;
    }

    default:
      return undefined;
  }
}

function applyFallback<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
  expertVoteCount: number,
): ConsensusResult<TCategory, TPerspective> {
  const strategy = config.fallback_strategy;

  switch (strategy) {
    case "halt":
    case "escalate":
    case "escalate_to_human":
      return buildFallbackResult(
        perspectives,
        config,
        expertVoteCount,
        strategy,
      );

    case "reject_all":
      return buildRejectAllResult(config, expertVoteCount, strategy);

    case "accept_all":
      return buildAcceptAllResult(
        perspectives,
        config,
        expertVoteCount,
        strategy,
      );

    case "defer_to_expert":
      return buildDeferToExpertResult(
        perspectives,
        config,
        expertVoteCount,
        strategy,
      );

    case "highest_confidence":
    default:
      return buildHighestConfidenceResult(
        perspectives,
        config,
        expertVoteCount,
        strategy,
      );
  }
}

function buildHighestConfidenceResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
  expertVoteCount: number,
  strategy: ConsensusConfig["fallback_strategy"],
): ConsensusResult<TCategory, TPerspective> {
  const sorted = orderBy([...perspectives], (p) => p.confidence, "desc");
  const winner = sorted[0];

  if (!winner) {
    return buildEmptyResult(config, expertVoteCount, strategy);
  }

  const category = winner.category_assessment;
  const voters = filter(
    perspectives,
    (p) => p.category_assessment === category,
  );
  const dissenters = filter(
    perspectives,
    (p) => p.category_assessment !== category,
  );

  return {
    consensus_category: category,
    consensus_voters: voters,
    dissenters,
    consensus_confidence: roundTo2(averageConfidence(voters)),
    mode_used: config.mode,
    fallback_applied: true,
    votes_for: voters.length,
    votes_against: dissenters.length,
    expert_votes: expertVoteCount,
    fallback_strategy_applied: strategy,
  };
}

function buildFallbackResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
  expertVoteCount: number,
  strategy: ConsensusConfig["fallback_strategy"],
): ConsensusResult<TCategory, TPerspective> {
  // For halt/escalate, pick highest confidence as nominal winner
  // but mark fallback_applied so callers know to halt/escalate
  const sorted = orderBy([...perspectives], (p) => p.confidence, "desc");
  const winner = sorted[0];

  if (!winner) {
    return buildEmptyResult(config, expertVoteCount, strategy);
  }

  const category = winner.category_assessment;
  const voters = filter(
    perspectives,
    (p) => p.category_assessment === category,
  );
  const dissenters = filter(
    perspectives,
    (p) => p.category_assessment !== category,
  );

  return {
    consensus_category: category,
    consensus_voters: voters,
    dissenters,
    consensus_confidence: roundTo2(averageConfidence(voters)),
    mode_used: config.mode,
    fallback_applied: true,
    votes_for: voters.length,
    votes_against: dissenters.length,
    expert_votes: expertVoteCount,
    fallback_strategy_applied: strategy,
  };
}

function buildRejectAllResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  config: ConsensusConfig,
  expertVoteCount: number,
  strategy: ConsensusConfig["fallback_strategy"],
): ConsensusResult<TCategory, TPerspective> {
  return {
    consensus_category: "" as TCategory,
    consensus_voters: [],
    dissenters: [],
    consensus_confidence: 0,
    mode_used: config.mode,
    fallback_applied: true,
    votes_for: 0,
    votes_against: 0,
    expert_votes: expertVoteCount,
    fallback_strategy_applied: strategy,
  };
}

function buildAcceptAllResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
  expertVoteCount: number,
  strategy: ConsensusConfig["fallback_strategy"],
): ConsensusResult<TCategory, TPerspective> {
  // Accept all: treat all perspectives as voters for the highest-confidence category
  const sorted = orderBy([...perspectives], (p) => p.confidence, "desc");
  const winner = sorted[0];

  if (!winner) {
    return buildEmptyResult(config, expertVoteCount, strategy);
  }

  return {
    consensus_category: winner.category_assessment,
    consensus_voters: perspectives,
    dissenters: [],
    consensus_confidence: roundTo2(averageConfidence(perspectives)),
    mode_used: config.mode,
    fallback_applied: true,
    votes_for: perspectives.length,
    votes_against: 0,
    expert_votes: expertVoteCount,
    fallback_strategy_applied: strategy,
  };
}

function buildDeferToExpertResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
  expertVoteCount: number,
  strategy: ConsensusConfig["fallback_strategy"],
): ConsensusResult<TCategory, TPerspective> {
  const expertSet = new Set(config.expert_agents);

  // Find expert perspectives
  const expertPerspectives = filter(
    perspectives,
    (p) =>
      "agent" in p &&
      expertSet.has((p as Record<string, unknown>).agent as string),
  );

  // If no expert perspectives found, fall back to highest confidence
  if (expertPerspectives.length === 0) {
    return buildHighestConfidenceResult(
      perspectives,
      config,
      expertVoteCount,
      strategy,
    );
  }

  // Pick the expert with the highest confidence
  const sortedExperts = orderBy(
    expertPerspectives,
    (p) => p.confidence,
    "desc",
  );
  const winner = sortedExperts[0]!;
  const category = winner.category_assessment;
  const voters = filter(
    perspectives,
    (p) => p.category_assessment === category,
  );
  const dissenters = filter(
    perspectives,
    (p) => p.category_assessment !== category,
  );

  return {
    consensus_category: category,
    consensus_voters: voters,
    dissenters,
    consensus_confidence: roundTo2(averageConfidence(voters)),
    mode_used: config.mode,
    fallback_applied: true,
    votes_for: voters.length,
    votes_against: dissenters.length,
    expert_votes: expertVoteCount,
    fallback_strategy_applied: strategy,
  };
}

function buildEmptyResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  config: ConsensusConfig,
  expertVoteCount: number,
  strategy: ConsensusConfig["fallback_strategy"],
): ConsensusResult<TCategory, TPerspective> {
  return {
    consensus_category: "" as TCategory,
    consensus_voters: [],
    dissenters: [],
    consensus_confidence: 0,
    mode_used: config.mode,
    fallback_applied: true,
    votes_for: 0,
    votes_against: 0,
    expert_votes: expertVoteCount,
    fallback_strategy_applied: strategy,
  };
}

function averageConfidence<TCategory extends string>(
  voters: VotablePerspective<TCategory>[],
): number {
  if (voters.length === 0) return 0;
  return voters.reduce((sum, p) => sum + p.confidence, 0) / voters.length;
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
