/**
 * Split verdict detection and rebuttal helpers for the pr-address skill.
 *
 * When parallel validator agents produce a split verdict on a PR comment
 * (e.g., 3-3 tie or narrow 4-2 split), these helpers detect the split,
 * generate rebuttal prompts, build structured results, and format output
 * for the PR summary.
 *
 * Follows the rebuttal prompt pattern from tribunal infrastructure
 * (src/agents/__helpers/tribunal-rebuttals.ts) but adapted for the
 * PR validation context where disagreements are about the validity of
 * a concern rather than severity or scope of a finding.
 */
import {
  verdictSplitSchema,
  splitVerdictResultSchema,
} from "~/skills/__schemas/pr-verdict-debate.schemas";
import type {
  ValidatorVerdict,
  VerdictSplit,
  VerdictRebuttal,
  VerdictRebuttalResolution,
  SplitVerdictResult,
} from "~/skills/__schemas/pr-verdict-debate.schemas";

/**
 * Detect split verdicts among validator results.
 *
 * Groups verdicts by comment_id, counts valid vs invalid votes, and
 * flags splits where the majority ratio is at or below the threshold.
 *
 * A split is detected when: majority_count / total_count <= splitThreshold.
 * Default threshold of 0.6 catches ties (3-3 = 0.5) and narrow splits
 * (4-2 = 0.67 is above 0.6, so NOT a split; 3-2 = 0.6 IS a split).
 *
 * @param verdicts - All validator verdicts across all comments
 * @param commentTexts - Map of comment_id to original comment text
 * @param splitThreshold - Maximum majority ratio to consider a split (default 0.6)
 * @returns Array of detected splits
 *
 * @example
 * ```typescript
 * const splits = detectVerdictSplits(verdicts, commentTexts);
 * // Returns splits where validators disagree (ties and narrow margins)
 * ```
 */
export function detectVerdictSplits(
  verdicts: ValidatorVerdict[],
  commentTexts: Map<string, string>,
  splitThreshold: number = 0.6,
): VerdictSplit[] {
  if (verdicts.length === 0) return [];

  // Group verdicts by comment_id
  const byComment = new Map<string, ValidatorVerdict[]>();
  for (const verdict of verdicts) {
    const existing = byComment.get(verdict.comment_id);
    if (existing) {
      existing.push(verdict);
    } else {
      byComment.set(verdict.comment_id, [verdict]);
    }
  }

  const splits: VerdictSplit[] = [];

  for (const [commentId, commentVerdicts] of byComment) {
    // Need at least 2 verdicts to have a split
    if (commentVerdicts.length < 2) continue;

    const validVerdicts = commentVerdicts.filter((v) => v.valid);
    const invalidVerdicts = commentVerdicts.filter((v) => !v.valid);

    const validCount = validVerdicts.length;
    const invalidCount = invalidVerdicts.length;
    const total = validCount + invalidCount;

    // If all agree (one side is 0), no split
    if (validCount === 0 || invalidCount === 0) continue;

    const majorityCount = Math.max(validCount, invalidCount);
    const majorityRatio = majorityCount / total;

    // Split detected when majority ratio is at or below threshold
    if (majorityRatio > splitThreshold) continue;

    const commentText = commentTexts.get(commentId) ?? "";
    const isTie = validCount === invalidCount;
    const splitRatio = `${validCount}-${invalidCount}`;

    const parsed = verdictSplitSchema.safeParse({
      comment_id: commentId,
      comment_text: commentText,
      valid_count: validCount,
      invalid_count: invalidCount,
      valid_verdicts: validVerdicts,
      invalid_verdicts: invalidVerdicts,
      split_ratio: splitRatio,
      is_tie: isTie,
    });

    if (parsed.success) {
      splits.push(parsed.data);
    }
  }

  return splits;
}

/**
 * Build a prompt for the dissenting side to articulate their strongest argument.
 *
 * The dissenting side is the minority (or either side in a tie). They are
 * prompted to explain why the majority may be wrong, focusing on specific
 * technical evidence, trade-offs, or context they may have missed.
 *
 * @param split - The detected verdict split
 * @returns A prompt string for the dissenting agent
 *
 * @example
 * ```typescript
 * const prompt = buildDissenterPrompt(split);
 * // Use prompt to spawn a sub-agent for the dissenting perspective
 * ```
 */
export function buildDissenterPrompt(split: VerdictSplit): string {
  const majorityIsValid = split.valid_count >= split.invalid_count;
  const majorityPosition = majorityIsValid ? "valid" : "invalid";
  const majorityCount = majorityIsValid
    ? split.valid_count
    : split.invalid_count;
  const minorityPosition = majorityIsValid ? "invalid" : "valid";
  const minorityCount = majorityIsValid
    ? split.invalid_count
    : split.valid_count;

  const majorityVerdicts = majorityIsValid
    ? split.valid_verdicts
    : split.invalid_verdicts;
  const minorityVerdicts = majorityIsValid
    ? split.invalid_verdicts
    : split.valid_verdicts;

  const majorityReasoning = majorityVerdicts
    .map((v) => `- ${v.agent}: ${v.reasoning}`)
    .join("\n");
  const minorityReasoning = minorityVerdicts
    .map((v) => `- ${v.agent}: ${v.reasoning}`)
    .join("\n");

  return `A PR review comment has produced a split verdict among validators.

**Original Comment:** ${split.comment_text}

**Majority Position (${majorityCount} validators):** The concern is ${majorityPosition}
**Majority Reasoning:**
${majorityReasoning}

**Your Position (${minorityCount} validators):** The concern is ${minorityPosition}
**Your Reasoning:**
${minorityReasoning}

Provide your strongest argument (2-3 sentences) for why the majority may be wrong.
Focus on specific technical evidence, trade-offs, or context they may have missed.`;
}

/**
 * Build a prompt for the majority side to respond to the dissent.
 *
 * The majority side receives the dissenter's argument and is prompted
 * to either uphold their position, acknowledge the dissent has merit,
 * or recommend escalating to human judgment.
 *
 * @param split - The detected verdict split
 * @param dissenterArgument - The dissenting side's articulated argument
 * @returns A prompt string for the majority-side agent
 *
 * @example
 * ```typescript
 * const prompt = buildMajorityResponsePrompt(split, dissenterArgument);
 * // Use prompt to spawn a sub-agent for the majority response
 * ```
 */
export function buildMajorityResponsePrompt(
  split: VerdictSplit,
  dissenterArgument: string,
): string {
  const majorityIsValid = split.valid_count >= split.invalid_count;
  const majorityPosition = majorityIsValid ? "valid" : "invalid";
  const majorityCount = majorityIsValid
    ? split.valid_count
    : split.invalid_count;

  return `A dissenting validator challenges the majority position on a PR comment.

**Original Comment:** ${split.comment_text}

**Your Position (${majorityCount} validators):** The concern is ${majorityPosition}
**Dissenter Challenge:** ${dissenterArgument}

Respond in 2-3 sentences. Either:
1. Uphold your position with counter-evidence
2. Acknowledge the dissent has merit and suggest deferring to human judgment

Return your response in this format:
RESOLUTION: majority_upheld | dissent_acknowledged | escalate_to_human
RESPONSE: [your response]`;
}

/**
 * Build a complete split verdict result from a split and its rebuttals.
 *
 * Determines the final recommendation and confidence score based on the
 * split ratio and rebuttal resolutions.
 *
 * Confidence calculation:
 * - Tie (equal counts): 0.5 base
 * - Narrow split (unequal counts): 0.65 base
 * - Dissent acknowledged: reduce by 0.1
 * - Escalate to human: set to 0.3
 *
 * @param split - The detected verdict split
 * @param rebuttals - Completed rebuttal exchanges for this split
 * @returns A complete SplitVerdictResult
 *
 * @example
 * ```typescript
 * const result = buildSplitVerdictResult(split, rebuttals);
 * // result.final_recommendation is "fix" | "disagree" | "defer_to_human"
 * ```
 */
export function buildSplitVerdictResult(
  split: VerdictSplit,
  rebuttals: VerdictRebuttal[],
): SplitVerdictResult {
  // Determine the majority's position
  const majorityIsValid = split.valid_count >= split.invalid_count;

  // Check rebuttal resolutions
  const hasEscalation = rebuttals.some(
    (r) => r.resolution === "escalate_to_human",
  );
  const hasDissenterAcknowledged = rebuttals.some(
    (r) => r.resolution === "dissent_acknowledged",
  );
  const allUpheld = rebuttals.every((r) => r.resolution === "majority_upheld");

  // Determine final recommendation
  let finalRecommendation: "fix" | "disagree" | "defer_to_human";
  if (hasEscalation || hasDissenterAcknowledged) {
    finalRecommendation = "defer_to_human";
  } else if (majorityIsValid && allUpheld) {
    finalRecommendation = "fix";
  } else if (!majorityIsValid && allUpheld) {
    finalRecommendation = "disagree";
  } else {
    finalRecommendation = "defer_to_human";
  }

  // Calculate confidence
  let confidence: number;
  if (hasEscalation) {
    confidence = 0.3;
  } else {
    // Base confidence depends on split ratio
    const baseConfidence = split.is_tie ? 0.5 : 0.65;
    confidence = hasDissenterAcknowledged
      ? baseConfidence - 0.1
      : baseConfidence;
  }

  // Generate both-perspectives summary
  const bothPerspectivesSummary = buildBothPerspectivesSummary(
    split,
    rebuttals,
  );

  return splitVerdictResultSchema.parse({
    comment_id: split.comment_id,
    comment_text: split.comment_text,
    split_ratio: split.split_ratio,
    rebuttals,
    final_recommendation: finalRecommendation,
    confidence,
    both_perspectives_summary: bothPerspectivesSummary,
  });
}

/**
 * Build a 2-3 sentence summary presenting both sides of the debate.
 *
 * @param split - The detected verdict split
 * @param rebuttals - Completed rebuttal exchanges
 * @returns A concise summary of both perspectives
 */
function buildBothPerspectivesSummary(
  split: VerdictSplit,
  rebuttals: VerdictRebuttal[],
): string {
  const majorityIsValid = split.valid_count >= split.invalid_count;
  const majorityLabel = majorityIsValid
    ? "valid concern"
    : "not a valid concern";
  const dissentLabel = majorityIsValid
    ? "not a valid concern"
    : "valid concern";

  const majorityCount = majorityIsValid
    ? split.valid_count
    : split.invalid_count;
  const minorityCount = majorityIsValid
    ? split.invalid_count
    : split.valid_count;

  const rebuttalSummary =
    rebuttals.length > 0
      ? ` After debate, the resolution was: ${rebuttals[0]!.resolution.replace(/_/g, " ")}.`
      : "";

  return (
    `${majorityCount} validators consider this a ${majorityLabel}, ` +
    `while ${minorityCount} consider it ${dissentLabel} (${split.split_ratio} split).` +
    rebuttalSummary
  );
}

/**
 * Format a split verdict result as a GitHub-compatible markdown comment body.
 *
 * Produces a structured display showing the split ratio, both perspectives,
 * the final recommendation, and confidence level.
 *
 * @param result - The complete split verdict result
 * @returns A markdown-formatted string for use in PR comments or summaries
 *
 * @example
 * ```typescript
 * const markdown = formatSplitVerdictForPR(result);
 * // Use markdown in a PR comment or summary section
 * ```
 */
export function formatSplitVerdictForPR(result: SplitVerdictResult): string {
  const recommendationLabel = result.final_recommendation.replace(/_/g, " ");

  let sections = `**Split Verdict (${result.split_ratio})**\n\n`;
  sections += `This comment produced a split verdict among reviewers.\n\n`;
  sections += `${result.both_perspectives_summary}\n\n`;

  if (result.rebuttals.length > 0) {
    for (const rebuttal of result.rebuttals) {
      sections += `**Dissenting View (${rebuttal.dissenter_agent}):** ${rebuttal.dissent_argument}\n\n`;
      sections += `**Majority Response:** ${rebuttal.majority_response}\n\n`;
    }
  }

  sections += `**Resolution:** ${recommendationLabel} (confidence: ${result.confidence.toFixed(2)})`;

  return sections;
}
