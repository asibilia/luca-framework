/**
 * Milestone debate orchestration helper.
 *
 * Coordinates the adversarial debate flow specific to milestone audits,
 * bridging between independent review outputs and the tribunal
 * infrastructure from ~/shared. All functions are pure (no I/O).
 *
 * @module milestone-debate
 */
import filter from "lodash/filter";

import {
  normalizeFindings,
  detectDisagreements,
  shouldRunTribunal,
} from "~/shared/__helpers/tribunal-detector";
import {
  buildRebuttalPrompts,
  buildTribunalResult,
} from "~/shared/__helpers/tribunal-rebuttals";
import type {
  ReviewFinding,
  Disagreement,
  Rebuttal,
  UnifiedRecommendation,
} from "~/shared/__schemas/tribunal.schemas";
import type { RebuttalPromptPair } from "~/shared/__helpers/tribunal-rebuttals";
import {
  COMPLEXITY_ORDER,
  type ComplexityLevel,
} from "~/complexity/__schemas/complexity.schemas";

import { milestoneDebateResultSchema } from "~/skills/__schemas/milestone-debate.schemas";
import type {
  MilestoneDebateConfig,
  MilestoneDebateResult,
} from "~/skills/__schemas/milestone-debate.schemas";

/**
 * Determine whether the milestone debate round should run.
 *
 * Evaluates three gates in order:
 * 1. Config: debate must be explicitly enabled
 * 2. Complexity: task must meet the minimum complexity threshold
 * 3. Tribunal: disagreements must exist with sufficient severity
 *
 * @param config - Milestone debate configuration
 * @param complexity - Current task complexity level (e.g., "COMPLEX")
 * @param reviewerOutputs - Map of agent name to raw review output
 * @returns Decision with boolean and human-readable reason
 *
 * @example
 * ```typescript
 * const decision = shouldRunMilestoneDebate(
 *   { enabled: true, min_complexity: "COMPLEX", max_rebuttal_rounds: 1, token_budget: 40000 },
 *   "COMPLEX",
 *   { "dx-advocate": [...], "code-simplifier": [...] },
 * );
 * if (decision.should_run) {
 *   // proceed with debate round
 * }
 * ```
 */
export function shouldRunMilestoneDebate(
  config: MilestoneDebateConfig,
  complexity: string,
  reviewerOutputs: Record<string, unknown>,
): { should_run: boolean; reason: string } {
  // Gate 1: Config enabled
  if (!config.enabled) {
    return {
      should_run: false,
      reason: "Milestone debate is disabled in config",
    };
  }

  // Gate 2: Complexity threshold
  const upperComplexity = complexity.toUpperCase();
  const currentOrder =
    COMPLEXITY_ORDER[upperComplexity as ComplexityLevel] ?? -1;
  const thresholdOrder =
    COMPLEXITY_ORDER[config.min_complexity as ComplexityLevel] ?? 3;

  if (currentOrder < thresholdOrder) {
    return {
      should_run: false,
      reason: `Complexity ${complexity} is below minimum threshold ${config.min_complexity}`,
    };
  }

  // Gate 3: Normalize findings and detect disagreements
  const findings = normalizeFindings(reviewerOutputs);

  if (findings.length === 0) {
    return {
      should_run: false,
      reason: "No findings to debate (all reviewers clean)",
    };
  }

  const disagreements = detectDisagreements(findings);

  if (disagreements.length === 0) {
    return {
      should_run: false,
      reason: "No disagreements detected among reviewers",
    };
  }

  // Gate 4: Tribunal severity gate (CRITICAL/HIGH required)
  const tribunalShouldRun = shouldRunTribunal(disagreements, complexity);

  if (!tribunalShouldRun) {
    return {
      should_run: false,
      reason:
        "Disagreements found but none involve CRITICAL or HIGH severity findings",
    };
  }

  return {
    should_run: true,
    reason: `${disagreements.length} disagreement(s) with HIGH/CRITICAL severity detected at ${complexity} complexity`,
  };
}

/**
 * Build milestone-augmented rebuttal prompt pairs from disagreements.
 *
 * Delegates to the tribunal infrastructure's `buildRebuttalPrompts()` and
 * augments each prompt pair with milestone-specific context (version info
 * and cross-phase scope awareness).
 *
 * @param disagreements - Detected disagreements between reviewers
 * @param milestoneVersion - Version string for the milestone being audited
 * @returns Array of rebuttal prompt pairs with milestone context
 *
 * @example
 * ```typescript
 * const prompts = buildMilestoneRebuttalContext(disagreements, "v2.5.1");
 * // Each prompt pair includes milestone version context
 * ```
 */
export function buildMilestoneRebuttalContext(
  disagreements: Disagreement[],
  milestoneVersion: string,
): RebuttalPromptPair[] {
  const basePairs = buildRebuttalPrompts(disagreements);

  // Augment prompts with milestone context
  return basePairs.map((pair) => ({
    ...pair,
    challenger_prompt: `[Milestone ${milestoneVersion} Audit Context]\n\nThis debate occurs during a milestone-wide audit reviewing changes across ALL phases. Consider cross-phase implications when making your argument.\n\n${pair.challenger_prompt}`,
    defender_prompt: `[Milestone ${milestoneVersion} Audit Context]\n\nThis debate occurs during a milestone-wide audit reviewing changes across ALL phases. Consider cross-phase implications when making your argument.\n\n${pair.defender_prompt}`,
  }));
}

/**
 * Build a complete milestone debate result from tribunal data.
 *
 * Wraps the core tribunal result with milestone-specific metadata:
 * cross-phase disagreement counts, milestone version, reviewer count,
 * and a generated consensus summary.
 *
 * @param milestoneVersion - Version string for the milestone (e.g., "v2.5.1")
 * @param reviewerCount - Number of reviewers that participated
 * @param allFindings - All normalized findings from reviewers
 * @param disagreements - Detected disagreements
 * @param rebuttals - Completed rebuttal records
 * @param recommendations - Unified recommendations after debate
 * @param phase - Phase number for the tribunal result
 * @returns Complete milestone debate result
 *
 * @example
 * ```typescript
 * const result = buildMilestoneDebateResult(
 *   "v2.5.1", 5, findings, disagreements, rebuttals, recommendations, 92,
 * );
 * ```
 */
export function buildMilestoneDebateResult(
  milestoneVersion: string,
  reviewerCount: number,
  allFindings: ReviewFinding[],
  disagreements: Disagreement[],
  rebuttals: Rebuttal[],
  recommendations: UnifiedRecommendation[],
  phase: number = 0,
): MilestoneDebateResult | null {
  // Build core tribunal result (now nullable after safeParse migration)
  const tribunalResult = buildTribunalResult(
    phase,
    allFindings,
    disagreements,
    rebuttals,
    recommendations,
  );

  if (!tribunalResult) {
    console.error(
      `[milestone-debate] Failed to build tribunal result; cannot produce milestone debate result`,
    );
    return null;
  }

  // Count cross-phase disagreements: disagreements where conflicting
  // findings reference files from different directories (heuristic for phases)
  const crossPhaseCount = countCrossPhaseDisagreements(disagreements);

  // Generate consensus summary from unified recommendations
  const consensusSummary = generateConsensusSummary(
    recommendations,
    rebuttals,
    disagreements,
  );

  const parsed = milestoneDebateResultSchema.safeParse({
    milestone_version: milestoneVersion,
    reviewer_count: reviewerCount,
    cross_phase_disagreements: crossPhaseCount,
    tribunal_result: tribunalResult,
    consensus_summary: consensusSummary,
  });

  if (!parsed.success) {
    console.error(
      `[milestone-debate] Failed to parse milestone debate result: ${parsed.error.message}`,
    );
    return null;
  }

  return parsed.data;
}

/**
 * Count disagreements where conflicting findings span different directory
 * paths (heuristic for cross-phase disagreements).
 *
 * A disagreement is considered cross-phase when the conflicting findings
 * reference files in different top-level source directories.
 */
function countCrossPhaseDisagreements(disagreements: Disagreement[]): number {
  let count = 0;

  for (const disagreement of disagreements) {
    const dirs = new Set(
      disagreement.conflicting_findings.map((f) => {
        // Extract first directory segment from file path
        const parts = f.file.split("/");
        return parts.length > 1 ? parts.slice(0, 2).join("/") : parts[0];
      }),
    );

    if (dirs.size > 1) {
      count++;
    }
  }

  return count;
}

/**
 * Generate a human-readable consensus summary from debate outcomes.
 */
function generateConsensusSummary(
  recommendations: UnifiedRecommendation[],
  rebuttals: Rebuttal[],
  disagreements: Disagreement[],
): string {
  if (disagreements.length === 0) {
    return "No disagreements detected. All reviewers are in consensus.";
  }

  const upheldCount = filter(
    rebuttals,
    (r) => r.resolution === "upheld",
  ).length;
  const withdrawnCount = filter(
    rebuttals,
    (r) => r.resolution === "withdrawn",
  ).length;
  const modifiedCount = filter(
    rebuttals,
    (r) => r.resolution === "modified",
  ).length;

  const highConfidence = filter(
    recommendations,
    (r) => r.confidence > 0.8,
  ).length;
  const contested = filter(
    recommendations,
    (r) => r.confidence >= 0.5 && r.confidence <= 0.8,
  ).length;

  const parts: string[] = [];

  parts.push(
    `${disagreements.length} disagreement(s) debated across ${rebuttals.length} rebuttal(s).`,
  );

  if (upheldCount > 0) {
    parts.push(`${upheldCount} finding(s) upheld after challenge.`);
  }
  if (withdrawnCount > 0) {
    parts.push(`${withdrawnCount} finding(s) withdrawn.`);
  }
  if (modifiedCount > 0) {
    parts.push(`${modifiedCount} finding(s) modified.`);
  }
  if (highConfidence > 0) {
    parts.push(`${highConfidence} high-confidence recommendation(s).`);
  }
  if (contested > 0) {
    parts.push(`${contested} contested recommendation(s) require attention.`);
  }

  return parts.join(" ");
}
