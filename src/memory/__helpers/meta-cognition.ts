/**
 * Reflective meta-cognition for plan quality assessment and learning.
 *
 * Provides structured reflection on completed tasks and plan quality
 * scoring based on past outcomes. Enables the system to learn from
 * its own performance over time.
 *
 * @module memory/meta-cognition
 */
import { z } from "zod";
import filter from "lodash/filter";
import isEmpty from "lodash/isEmpty";

// ─── Schemas ─────────────────────────────────────────────────────────────────

/**
 * Structured reflection on a completed task or phase.
 *
 * Captures what worked, what didn't, and actionable improvements
 * for future sessions. Fed into MEMORY.md as candidate learnings.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const ReflectionSchema = z.object({
  /** What the task or phase was about */
  summary: z.string(),
  /** Outcome description (success, partial, failure) */
  outcome: z.enum(["success", "partial", "failure"]),
  /** What went well */
  strengths: z.array(z.string()).default([]),
  /** What went poorly or could improve */
  weaknesses: z.array(z.string()).default([]),
  /** Concrete actionable improvements for next time */
  improvements: z.array(z.string()).default([]),
  /** Confidence in this reflection's accuracy (0-1) */
  confidence: z.number().min(0).max(1).default(0.5),
  /** ISO 8601 timestamp when the reflection was generated */
  generated_at: z.string(),
});

export type Reflection = z.infer<typeof ReflectionSchema>;

/**
 * Quality assessment of a plan based on structural analysis
 * and (optionally) past outcome data.
 *
 * Uses snake_case for all field names per API conventions.
 */
export const QualityAssessmentSchema = z.object({
  /** Overall quality score (0-1) */
  score: z.number().min(0).max(1),
  /** Breakdown of individual quality dimensions */
  dimensions: z.object({
    /** Does the plan have a clear, measurable objective? (0-1) */
    clarity: z.number().min(0).max(1),
    /** Are tasks broken down into verifiable steps? (0-1) */
    granularity: z.number().min(0).max(1),
    /** Does the plan include verification criteria? (0-1) */
    verifiability: z.number().min(0).max(1),
    /** Is scope reasonable given past performance? (0-1) */
    scope_fit: z.number().min(0).max(1),
  }),
  /** Issues found during assessment */
  issues: z.array(z.string()).default([]),
  /** Suggestions to improve the plan */
  suggestions: z.array(z.string()).default([]),
  /** ISO 8601 timestamp when the assessment was generated */
  assessed_at: z.string(),
});

export type QualityAssessment = z.infer<typeof QualityAssessmentSchema>;

/**
 * A past outcome record used for calibrating plan quality scoring.
 */
export const PastOutcomeSchema = z.object({
  /** Phase or plan identifier */
  plan_id: z.string(),
  /** Whether the plan succeeded */
  outcome: z.enum(["success", "partial", "failure"]),
  /** Number of tasks in the plan */
  task_count: z.number().int().nonnegative(),
  /** Number of verification criteria defined */
  verification_count: z.number().int().nonnegative(),
});

export type PastOutcome = z.infer<typeof PastOutcomeSchema>;

// ─── Plan Quality Assessment ─────────────────────────────────────────────────

/**
 * Assess the quality of a plan based on its content and past outcomes.
 *
 * Analyzes structural signals in the plan text:
 * - Clarity: presence of objective/goal section
 * - Granularity: number of task items
 * - Verifiability: presence of verification/test criteria
 * - Scope fit: calibrated against past outcome success rates
 *
 * @param planContent - Raw markdown content of the plan
 * @param pastOutcomes - Historical outcomes for calibration
 * @returns A QualityAssessment with scores and suggestions
 *
 * @example
 * ```typescript
 * const assessment = assessPlanQuality(planMarkdown, []);
 * if (assessment.score < 0.5) {
 *   console.warn("Plan quality is low:", assessment.issues);
 * }
 * ```
 */
export function assessPlanQuality(
  planContent: string,
  pastOutcomes: PastOutcome[],
): QualityAssessment {
  const issues: string[] = [];
  const suggestions: string[] = [];

  // ─── Clarity ───────────────────────────────────────────────────────
  const hasObjective = /^#+\s*(objective|goal|purpose|overview)/im.test(
    planContent,
  );
  const hasContext = /^#+\s*(context|background)/im.test(planContent);
  const clarity = hasObjective && hasContext ? 1.0 : hasObjective ? 0.7 : 0.3;

  if (!hasObjective) {
    issues.push("No clear objective/goal section found");
    suggestions.push("Add an ## Objective section with measurable goals");
  }

  // ─── Granularity ───────────────────────────────────────────────────
  const taskMatches = planContent.match(/^[-*]\s+\[[ x]\]/gm) || [];
  const numberedTasks = planContent.match(/^\d+\.\s+/gm) || [];
  const taskCount = taskMatches.length + numberedTasks.length;

  const granularity =
    taskCount === 0 ? 0.1 : taskCount <= 3 ? 0.5 : taskCount <= 10 ? 0.9 : 0.7; // too many tasks = scope risk

  if (taskCount === 0) {
    issues.push("No task items found (checkboxes or numbered list)");
    suggestions.push("Break work into discrete, checkable tasks");
  } else if (taskCount > 10) {
    issues.push(`High task count (${taskCount}) may indicate scope creep`);
    suggestions.push("Consider splitting into multiple plans/waves");
  }

  // ─── Verifiability ─────────────────────────────────────────────────
  const hasVerification =
    /^#+\s*(verification|test|success\s+criteria|acceptance)/im.test(
      planContent,
    );
  const hasTestMention = /\b(test|spec|assert|expect|verify)\b/i.test(
    planContent,
  );
  const verifiability =
    hasVerification && hasTestMention
      ? 1.0
      : hasVerification || hasTestMention
        ? 0.6
        : 0.2;

  if (!hasVerification) {
    issues.push("No verification/test criteria section found");
    suggestions.push(
      "Add ## Verification section with concrete pass/fail criteria",
    );
  }

  // ─── Scope Fit ─────────────────────────────────────────────────────
  let scopeFit = 0.5; // neutral default

  if (!isEmpty(pastOutcomes)) {
    const successRate =
      filter(pastOutcomes, (o) => o.outcome === "success").length /
      pastOutcomes.length;

    // Plans with verification criteria historically succeed more
    const verifiedPlans = filter(pastOutcomes, (o) => o.verification_count > 0);
    const verifiedSuccessRate = isEmpty(verifiedPlans)
      ? 0
      : filter(verifiedPlans, (o) => o.outcome === "success").length /
        verifiedPlans.length;

    // Higher scope fit if current plan follows patterns of successful past plans
    scopeFit = hasVerification
      ? Math.min(1.0, verifiedSuccessRate + 0.2)
      : Math.min(1.0, successRate);

    if (successRate < 0.5) {
      suggestions.push(
        "Past plans have a low success rate — consider reducing scope",
      );
    }
  }

  // ─── Composite Score ───────────────────────────────────────────────
  const score =
    clarity * 0.25 + granularity * 0.25 + verifiability * 0.3 + scopeFit * 0.2;

  return {
    score: Math.round(score * 100) / 100,
    dimensions: {
      clarity: Math.round(clarity * 100) / 100,
      granularity: Math.round(granularity * 100) / 100,
      verifiability: Math.round(verifiability * 100) / 100,
      scope_fit: Math.round(scopeFit * 100) / 100,
    },
    issues,
    suggestions,
    assessed_at: new Date().toISOString(),
  };
}

// ─── Reflection Generation ───────────────────────────────────────────────────

/**
 * Generate a structured reflection from a task summary and outcome.
 *
 * Extracts strengths and weaknesses from the summary text using
 * simple heuristic signals, then generates improvement suggestions.
 *
 * @param summary - Description of what was done
 * @param outcome - Whether the task succeeded, partially succeeded, or failed
 * @returns A structured Reflection
 *
 * @example
 * ```typescript
 * const reflection = generateReflection(
 *   "Implemented auth module with full test coverage",
 *   "success"
 * );
 * ```
 */
export function generateReflection(
  summary: string,
  outcome: "success" | "partial" | "failure",
): Reflection {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const improvements: string[] = [];

  // Extract positive signals
  if (/test|spec|coverage/i.test(summary)) {
    strengths.push("Included testing");
  }
  if (/refactor|clean|simplif/i.test(summary)) {
    strengths.push("Code quality improvements made");
  }
  if (/verif|valid/i.test(summary)) {
    strengths.push("Verification was performed");
  }

  // Extract negative signals
  if (/hack|workaround|temporary|todo/i.test(summary)) {
    weaknesses.push("Contains temporary solutions or workarounds");
    improvements.push("Schedule follow-up to address workarounds");
  }
  if (/skip|bypass|disable/i.test(summary)) {
    weaknesses.push("Some checks were skipped or bypassed");
    improvements.push("Ensure all checks pass before marking complete");
  }

  // Outcome-based signals
  if (outcome === "failure") {
    weaknesses.push("Task did not complete successfully");
    improvements.push("Review approach and consider alternative strategies");
    improvements.push("Break task into smaller, more verifiable steps");
  } else if (outcome === "partial") {
    weaknesses.push("Task only partially completed");
    improvements.push("Define clearer completion criteria upfront");
  }

  if (outcome === "success" && isEmpty(strengths)) {
    strengths.push("Task completed successfully");
  }

  // Confidence based on outcome and detail level
  const confidence =
    outcome === "success" ? 0.8 : outcome === "partial" ? 0.6 : 0.4;

  return {
    summary,
    outcome,
    strengths,
    weaknesses,
    improvements,
    confidence,
    generated_at: new Date().toISOString(),
  };
}
