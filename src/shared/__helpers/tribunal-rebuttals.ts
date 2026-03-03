import orderBy from "lodash/orderBy";
import groupBy from "lodash/groupBy";

import {
  rebuttalSchema,
  unifiedRecommendationSchema,
  tribunalResultSchema,
} from "../__schemas/tribunal.schemas";
import type {
  Disagreement,
  ReviewFinding,
  Rebuttal,
  UnifiedRecommendation,
  TribunalResult,
} from "../__schemas/tribunal.schemas";
import { countResolutions } from "./resolution-counts";
import { sanitizeForTemplate } from "./sanitize-template";

/**
 * A prompt pair for a single rebuttal round.
 *
 * Contains the challenger's prompt and the defender's prompt,
 * along with metadata for tracking.
 */
export interface RebuttalPromptPair {
  /** ID of the disagreement being debated */
  disagreement_id: string;
  /** ID of the finding being challenged */
  finding_id: string;
  /** Name of the agent whose finding is being challenged */
  defender_agent: string;
  /** Name of the challenging agent */
  challenger_agent: string;
  /** Prompt for the challenger to generate a challenge argument */
  challenger_prompt: string;
  /** Prompt for the defender to respond to the challenge */
  defender_prompt: string;
}

/**
 * Build rebuttal prompt pairs from detected disagreements.
 *
 * For each disagreement, generates challenger/defender prompts
 * that can be sent to agents for debate. In each disagreement,
 * the finding with the highest severity is challenged by the
 * agent with the lowest severity (or vice versa for scope overlaps).
 *
 * This function generates prompts but does NOT call LLMs. The
 * phase-execute skill is responsible for spawning agents with
 * these prompts.
 *
 * @param disagreements - Detected disagreements between reviewers
 * @returns Array of rebuttal prompt pairs for agent spawning
 *
 * @example
 * ```typescript
 * const prompts = buildRebuttalPrompts(disagreements);
 * // Each prompt pair can be used to spawn challenger/defender agents
 * ```
 */
export function buildRebuttalPrompts(
  disagreements: Disagreement[],
): RebuttalPromptPair[] {
  const promptPairs: RebuttalPromptPair[] = [];

  for (const disagreement of disagreements) {
    const findings = disagreement.conflicting_findings;
    if (findings.length < 2) continue;

    // For severity mismatch: higher severity defends, lower severity challenges
    // For scope overlap: first finding defends, second challenges
    const sorted = orderBy(findings, (f) => severityRank(f.severity), "desc");

    const defender = sorted[0]!;
    const challenger = sorted[1]!;

    const challengerPrompt = buildChallengerPrompt(
      defender,
      challenger,
      disagreement,
    );
    const defenderPrompt = buildDefenderPrompt(
      defender,
      challenger,
      disagreement,
    );

    promptPairs.push({
      disagreement_id: disagreement.id,
      finding_id: defender.id,
      defender_agent: defender.source_agent,
      challenger_agent: challenger.source_agent,
      challenger_prompt: challengerPrompt,
      defender_prompt: defenderPrompt,
    });
  }

  return promptPairs;
}

/** Severity ranking for sorting (higher = more severe) */
function severityRank(severity: string): number {
  const ranks: Record<string, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };
  return ranks[severity] ?? 0;
}

/**
 * Build the challenger's prompt for a rebuttal round.
 */
function buildChallengerPrompt(
  defendedFinding: ReviewFinding,
  challengerFinding: ReviewFinding,
  disagreement: Disagreement,
): string {
  return `You are reviewing a code review finding that you disagree with.

**File:** ${sanitizeForTemplate(defendedFinding.file)}:${defendedFinding.line}
**Original Finding (${sanitizeForTemplate(defendedFinding.source_agent)}):**
- Severity: ${defendedFinding.severity}
- Issue: ${sanitizeForTemplate(defendedFinding.issue)}
- Suggestion: ${sanitizeForTemplate(defendedFinding.suggestion)}

**Your Assessment (${sanitizeForTemplate(challengerFinding.source_agent)}):**
- Severity: ${challengerFinding.severity}
- Issue: ${sanitizeForTemplate(challengerFinding.issue)}
- Suggestion: ${sanitizeForTemplate(challengerFinding.suggestion)}

**Conflict Type:** ${disagreement.conflict_type}

Provide a concise challenge (2-3 sentences) explaining why the original finding's severity or assessment should be reconsidered. Focus on:
1. Whether the issue severity is appropriate
2. Whether the issue actually warrants attention
3. Whether there is a better way to characterize or address the issue

Return ONLY the challenge argument text.`;
}

/**
 * Build the defender's prompt for a rebuttal round.
 */
function buildDefenderPrompt(
  defendedFinding: ReviewFinding,
  challengerFinding: ReviewFinding,
  disagreement: Disagreement,
): string {
  return `Your code review finding is being challenged by another reviewer.

**Your Finding (${sanitizeForTemplate(defendedFinding.source_agent)}):**
- File: ${sanitizeForTemplate(defendedFinding.file)}:${defendedFinding.line}
- Severity: ${defendedFinding.severity}
- Issue: ${sanitizeForTemplate(defendedFinding.issue)}
- Suggestion: ${sanitizeForTemplate(defendedFinding.suggestion)}

**Challenger (${sanitizeForTemplate(challengerFinding.source_agent)}) Assessment:**
- Severity: ${challengerFinding.severity}
- Issue: ${sanitizeForTemplate(challengerFinding.issue)}
- Suggestion: ${sanitizeForTemplate(challengerFinding.suggestion)}

**Conflict Type:** ${disagreement.conflict_type}

The challenger will argue that your finding should be reconsidered. After reviewing their challenge, respond with:
1. Whether you uphold, withdraw, or modify your finding
2. A brief defense (2-3 sentences) explaining your decision

Return your response in this format:
RESOLUTION: upheld | withdrawn | modified
RESPONSE: [your defense]`;
}

/**
 * Resolve rebuttals into unified recommendations.
 *
 * Takes completed rebuttal records and the original findings
 * to produce unified recommendations with confidence scores
 * and debate history.
 *
 * For findings that were not disputed, they pass through with
 * full confidence (1.0) and agreement from all agents.
 *
 * @param allFindings - All original findings
 * @param rebuttals - Completed rebuttal records
 * @returns Array of unified recommendations
 *
 * @example
 * ```typescript
 * const recommendations = resolveRebuttals(allFindings, rebuttals);
 * // Findings with rebuttals get adjusted confidence; undisputed findings get 1.0
 * ```
 */
export function resolveRebuttals(
  allFindings: ReviewFinding[],
  rebuttals: Rebuttal[],
): UnifiedRecommendation[] {
  const recommendations: UnifiedRecommendation[] = [];
  const disputedFindingIds = new Set(rebuttals.map((r) => r.finding_id));
  const rebuttalsByFinding = groupBy(rebuttals, (r) => r.finding_id);

  for (const finding of allFindings) {
    const findingRebuttals = rebuttalsByFinding[finding.id] ?? [];

    if (!disputedFindingIds.has(finding.id)) {
      // Undisputed finding: full confidence
      const parsed = unifiedRecommendationSchema.safeParse({
        finding,
        confidence: 1.0,
        agreement_count: 1,
        dissent_count: 0,
        debate_history: [],
      });
      if (parsed.success) {
        recommendations.push(parsed.data);
      }
      continue;
    }

    // Disputed finding: calculate confidence based on rebuttal outcomes
    const {
      upheld: upheldCount,
      withdrawn: withdrawnCount,
      modified: modifiedCount,
    } = countResolutions(findingRebuttals);
    const totalRebuttals = findingRebuttals.length;

    // Skip withdrawn findings
    if (withdrawnCount > 0 && upheldCount === 0 && modifiedCount === 0) {
      continue;
    }

    // Confidence: upheld contributes positively, modified partially, withdrawn negatively
    const confidence =
      totalRebuttals > 0
        ? Math.min(
            1.0,
            Math.max(0.0, (upheldCount + modifiedCount * 0.5) / totalRebuttals),
          )
        : 1.0;

    const parsed = unifiedRecommendationSchema.safeParse({
      finding,
      confidence,
      agreement_count: upheldCount + (modifiedCount > 0 ? 1 : 0),
      dissent_count: withdrawnCount,
      debate_history: findingRebuttals,
    });
    if (parsed.success) {
      recommendations.push(parsed.data);
    }
  }

  return recommendations;
}

/**
 * Build a complete TribunalResult from findings, disagreements, and rebuttals.
 *
 * Aggregates all tribunal data into a single result object for
 * display, metrics, and downstream processing.
 *
 * @param phase - Phase number
 * @param allFindings - All original findings from reviewers
 * @param disagreements - Detected disagreements
 * @param rebuttals - Completed rebuttals
 * @param recommendations - Unified recommendations after debate
 * @returns Validated TribunalResult
 *
 * @example
 * ```typescript
 * const result = buildTribunalResult(91, findings, disagreements, rebuttals, recommendations);
 * ```
 */
export function buildTribunalResult(
  phase: number,
  allFindings: ReviewFinding[],
  disagreements: Disagreement[],
  rebuttals: Rebuttal[],
  recommendations: UnifiedRecommendation[],
): TribunalResult | null {
  const { withdrawn: withdrawnCount, modified: modifiedCount } =
    countResolutions(rebuttals);

  // Estimate token cost: ~200 tokens per prompt pair
  const estimatedTokenCost = rebuttals.length * 400;

  const parsed = tribunalResultSchema.safeParse({
    phase,
    total_findings: allFindings.length,
    disagreements_detected: disagreements.length,
    rebuttals_conducted: rebuttals.length,
    findings_withdrawn: withdrawnCount,
    findings_modified: modifiedCount,
    unified_recommendations: recommendations,
    debate_token_cost: estimatedTokenCost,
    timestamp: new Date().toISOString(),
  });

  if (!parsed.success) {
    console.error(
      `[tribunal-rebuttals] Failed to parse tribunal result: ${parsed.error.message}`,
    );
    return null;
  }

  return parsed.data;
}
