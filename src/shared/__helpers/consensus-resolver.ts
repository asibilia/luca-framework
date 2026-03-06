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
import orderBy from "lodash/orderBy";

import type { ConsensusConfig } from "../__schemas/consensus.schemas";
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

  // Not enough perspectives: go straight to fallback
  if (perspectives.length < config.min_perspectives) {
    return applyFallback(perspectives, config);
  }

  // Count votes per category with optional expert weighting
  const votes = countVotes(perspectives, config);

  // Total effective vote count (includes expert double-counting)
  const totalVotes = [...votes.values()].reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );

  // Try to find consensus based on mode
  const modeResult = tryResolveByMode(votes, totalVotes, config);

  if (modeResult) {
    const consensusVoters = modeResult.voters;
    const dissenters = perspectives.filter(
      (p) => p.category_assessment !== modeResult.category,
    );
    return {
      consensus_category: modeResult.category as TCategory,
      consensus_voters: consensusVoters as TPerspective[],
      dissenters: dissenters,
      consensus_confidence: roundTo2(averageConfidence(consensusVoters)),
      mode_used: config.mode,
      fallback_applied: false,
    };
  }

  // No consensus reached by the configured mode
  return applyFallback(perspectives, config);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface VoteEntry<TPerspective> {
  readonly voters: TPerspective[];
  readonly weight: number;
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

  const votes = new Map<string, VoteEntry<TPerspective>>();

  for (const perspective of perspectives) {
    const category = perspective.category_assessment;
    const existing = votes.get(category);
    const voteWeight =
      isExpertMode &&
      "agent" in perspective &&
      expertSet.has((perspective as Record<string, unknown>).agent as string)
        ? 2
        : 1;

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
): { category: string; voters: TPerspective[] } | undefined {
  switch (config.mode) {
    case "unanimous": {
      // All perspectives must agree (single category)
      if (votes.size === 1) {
        const [category, entry] = [...votes.entries()][0]!;
        return { category, voters: entry.voters };
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
          return { category, voters: entry.voters };
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
): ConsensusResult<TCategory, TPerspective> {
  switch (config.fallback_strategy) {
    case "halt":
      return buildFallbackResult(perspectives, config, "halt");

    case "escalate":
      return buildFallbackResult(perspectives, config, "escalate");

    case "highest_confidence":
    default: {
      // Pick the perspective with the highest confidence
      const sorted = orderBy([...perspectives], (p) => p.confidence, "desc");
      const winner = sorted[0];

      if (!winner) {
        // Empty perspectives edge case
        return {
          consensus_category: "" as TCategory,
          consensus_voters: [],
          dissenters: [],
          consensus_confidence: 0,
          mode_used: config.mode,
          fallback_applied: true,
        };
      }

      const category = winner.category_assessment;
      const voters = perspectives.filter(
        (p) => p.category_assessment === category,
      );
      const dissenters = perspectives.filter(
        (p) => p.category_assessment !== category,
      );

      return {
        consensus_category: category,
        consensus_voters: voters,
        dissenters,
        consensus_confidence: roundTo2(averageConfidence(voters)),
        mode_used: config.mode,
        fallback_applied: true,
      };
    }
  }
}

function buildFallbackResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: TPerspective[],
  config: ConsensusConfig,
  _strategy: "halt" | "escalate",
): ConsensusResult<TCategory, TPerspective> {
  // For halt/escalate, pick highest confidence as nominal winner
  // but mark fallback_applied so callers know to halt/escalate
  const sorted = orderBy([...perspectives], (p) => p.confidence, "desc");
  const winner = sorted[0];

  if (!winner) {
    return {
      consensus_category: "" as TCategory,
      consensus_voters: [],
      dissenters: [],
      consensus_confidence: 0,
      mode_used: config.mode,
      fallback_applied: true,
    };
  }

  const category = winner.category_assessment;
  const voters = perspectives.filter((p) => p.category_assessment === category);
  const dissenters = perspectives.filter(
    (p) => p.category_assessment !== category,
  );

  return {
    consensus_category: category,
    consensus_voters: voters,
    dissenters,
    consensus_confidence: roundTo2(averageConfidence(voters)),
    mode_used: config.mode,
    fallback_applied: true,
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
