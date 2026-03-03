/**
 * Generic majority-vote consensus resolution for tribunal patterns.
 *
 * Extracts the common algorithm used by both resolveVerificationTribunal()
 * and resolveRootCauseTribunal(): count votes, find majority, tiebreak on
 * highest confidence, record dissenter, calculate consensus confidence.
 *
 * T0-compliant: imports nothing from src/.
 */

/**
 * Minimum interface a perspective must satisfy to participate in majority vote.
 *
 * Both DiagnosticPerspective (verification tribunal) and RootCausePerspective
 * (root cause tribunal) satisfy this constraint.
 */
export interface VotablePerspective<TCategory extends string> {
  /** The voter's category assessment */
  readonly category_assessment: TCategory;
  /** Confidence in the assessment (0.0 - 1.0) */
  readonly confidence: number;
}

/**
 * Result of resolving a majority vote across three perspectives.
 *
 * @typeParam TCategory - The union of valid category strings
 * @typeParam TPerspective - The full perspective type (superset of VotablePerspective)
 */
export interface MajorityVoteResult<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
> {
  /** The winning category (majority or highest-confidence tiebreaker) */
  readonly consensus_category: TCategory;
  /** Perspectives that voted for the consensus category */
  readonly consensus_voters: TPerspective[];
  /** Dissenting perspective, if any agent disagreed (or highest-confidence runner-up in 3-way split) */
  readonly dissenter: TPerspective | undefined;
  /** Average confidence of agreeing voters, rounded to 2 decimal places */
  readonly consensus_confidence: number;
}

/**
 * Resolve a majority vote from exactly three perspectives.
 *
 * Algorithm:
 * 1. Count votes per category from 3 perspectives
 * 2. Find majority (2+ votes)
 * 3. If no majority (3-way split), use highest-confidence perspective as tiebreaker
 * 4. Record dissenting perspective
 * 5. Calculate consensus confidence (average of agreeing voters, rounded to 2dp)
 *
 * @param perspectives - Exactly three votable perspectives
 * @returns MajorityVoteResult with consensus category, voters, dissenter, and confidence
 *
 * @example
 * ```typescript
 * const result = resolveMajorityVote([
 *   { category_assessment: "tests_incomplete", confidence: 0.9, agent: "a", ... },
 *   { category_assessment: "tests_incomplete", confidence: 0.85, agent: "b", ... },
 *   { category_assessment: "wiring_issue", confidence: 0.7, agent: "c", ... },
 * ]);
 * // result.consensus_category === "tests_incomplete"
 * // result.consensus_confidence === 0.88  (average of 0.9, 0.85)
 * // result.dissenter?.category_assessment === "wiring_issue"
 * ```
 */
export function resolveMajorityVote<
  TCategory extends string,
  TPerspective extends VotablePerspective<TCategory>,
>(
  perspectives: [TPerspective, TPerspective, TPerspective],
): MajorityVoteResult<TCategory, TPerspective> {
  // Count votes per category
  const votes = new Map<TCategory, TPerspective[]>();
  for (const perspective of perspectives) {
    const category = perspective.category_assessment;
    const existing = votes.get(category);
    if (existing) {
      existing.push(perspective);
    } else {
      votes.set(category, [perspective]);
    }
  }

  // Find majority (2+ votes) or highest-confidence tiebreaker
  let consensusCategory: TCategory;
  let consensusVoters: TPerspective[];
  let dissenter: TPerspective | undefined;

  // Check for majority
  const majority = [...votes.entries()].find(
    ([, voters]) => voters.length >= 2,
  );

  if (majority) {
    consensusCategory = majority[0];
    consensusVoters = majority[1];
    // Find dissenter (if any)
    dissenter = perspectives.find(
      (p) => p.category_assessment !== consensusCategory,
    );
  } else {
    // Three-way split: use highest confidence
    const sorted = [...perspectives].sort(
      (a, b) => b.confidence - a.confidence,
    );
    consensusCategory = sorted[0]!.category_assessment;
    consensusVoters = [sorted[0]!];
    // The other two are dissenters; pick the one with higher confidence
    dissenter = sorted[1];
  }

  // Calculate consensus confidence (average of agreeing voters)
  const consensusConfidence =
    consensusVoters.reduce((sum, p) => sum + p.confidence, 0) /
    consensusVoters.length;

  return {
    consensus_category: consensusCategory,
    consensus_voters: consensusVoters,
    dissenter,
    consensus_confidence: Math.round(consensusConfidence * 100) / 100,
  };
}
