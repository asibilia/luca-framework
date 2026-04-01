/**
 * Deterministic heuristic complexity classifier.
 *
 * Scores task complexity from input signals using a weighted-sum
 * algorithm across five dimensions: keyword, file_scope, cross_cutting,
 * risk, and novelty. Returns structured output with complexity level,
 * routing decision, composite score, and per-signal breakdown.
 *
 * Zero LLM dependency -- pure deterministic computation.
 *
 * Uses snake_case for all field names per API conventions.
 *
 * @example
 * ```typescript
 * const result = classifyComplexity({
 *   description: "fix a typo in README",
 *   file_count: 1,
 * });
 * // { complexity: "TRIVIAL", route: "direct", score: 0.08, signals: {...} }
 * ```
 */
import {
  COMPLEXITY_LEVELS,
  COMPLEXITY_ORDER,
} from "../__schemas/complexity.schemas";
import {
  classifierInputSchema,
  classifierWeightsSchema,
  classifierThresholdsSchema,
} from "../__schemas/classify.schemas";

import type { ComplexityLevel } from "../__schemas/complexity.schemas";
import type {
  ClassifierInput,
  ClassifierOutput,
  ClassifierWeights,
  ClassifierThresholds,
} from "../__schemas/classify.schemas";

// ─── Keyword Dictionaries ───────────────────────────────────────────────────

/** Keywords associated with each complexity level, ordered by severity */
const KEYWORD_DICTIONARIES: Record<ComplexityLevel, readonly string[]> = {
  TRIVIAL: ["typo", "rename", "comment", "formatting", "whitespace", "readme"],
  SIMPLE: [
    "update",
    "add field",
    "config change",
    "bump version",
    "add import",
    "fix test",
    "add test",
  ],
  MODERATE: [
    "feature",
    "refactor",
    "new component",
    "new module",
    "endpoint",
    "validation",
    "schema",
  ],
  COMPLEX: [
    "cross-cutting",
    "migration",
    "multi-package",
    "breaking",
    "multi-file",
    "integration",
    "pipeline",
  ],
  CRITICAL: [
    "architecture",
    "rewrite",
    "system-wide",
    "security vulnerability",
    "redesign",
    "infrastructure",
    "platform",
  ],
} as const;

/** Risk indicator keywords for risk scoring */
const RISK_KEYWORDS = [
  "security",
  "vulnerability",
  "breaking",
  "migration",
  "production",
  "critical",
  "downtime",
  "data loss",
  "auth",
  "permission",
  "encryption",
  "credential",
] as const;

// ─── Signal Scoring Functions ───────────────────────────────────────────────

/**
 * Score keyword matches in the description.
 *
 * Scans the description against all keyword dictionaries. The highest
 * matching complexity level determines the base score. Returns a
 * normalized 0-1 score based on the matched level's position.
 *
 * @param description - Task description to scan
 * @returns Score from 0.0 (no keywords) to 1.0 (CRITICAL keywords)
 */
function scoreKeywords(description: string): {
  score: number;
  matched_keywords: string[];
} {
  const lower = description.toLowerCase();
  let highestLevel = -1;
  const matched_keywords: string[] = [];

  for (const level of COMPLEXITY_LEVELS) {
    for (const keyword of KEYWORD_DICTIONARIES[level]) {
      if (lower.includes(keyword.toLowerCase())) {
        const levelIndex = COMPLEXITY_ORDER[level];
        if (levelIndex > highestLevel) {
          highestLevel = levelIndex;
        }
        matched_keywords.push(keyword);
      }
    }
  }

  if (highestLevel < 0) {
    return { score: 0.0, matched_keywords };
  }

  // Map level index (0-4) to score: TRIVIAL=0.1, SIMPLE=0.3, MODERATE=0.5, COMPLEX=0.7, CRITICAL=1.0
  const levelScores = [0.1, 0.3, 0.5, 0.7, 1.0] as const;
  return { score: levelScores[highestLevel] ?? 0.0, matched_keywords };
}

/**
 * Score file scope dimension.
 *
 * Maps file count to a 0-1 score using defined breakpoints.
 *
 * @param fileCount - Number of files expected to be touched
 * @returns Score from 0.0 (0 files) to 1.0 (10+ files)
 */
function scoreFileScope(fileCount: number | undefined): number {
  if (fileCount === undefined || fileCount === 0) return 0.0;
  if (fileCount === 1) return 0.1;
  if (fileCount <= 3) return 0.3;
  if (fileCount <= 5) return 0.5;
  if (fileCount <= 10) return 0.7;
  return 1.0;
}

/**
 * Score cross-cutting scope dimension.
 *
 * Maps number of affected domains to a 0-1 score.
 *
 * @param domains - Array of affected domain names
 * @returns Score from 0.0 (0 domains) to 1.0 (5+ domains)
 */
function scoreCrossCutting(domains: string[] | undefined): number {
  if (!domains || domains.length === 0) return 0.0;
  if (domains.length === 1) return 0.2;
  if (domains.length === 2) return 0.5;
  if (domains.length <= 4) return 0.8;
  return 1.0;
}

/**
 * Score risk dimension.
 *
 * Counts risk indicator keywords in the description and normalizes
 * against the total number of known risk keywords.
 *
 * @param description - Task description to scan for risk indicators
 * @param riskIndicators - Explicit risk indicators provided by caller
 * @returns Score from 0.0 (no risk) to 1.0 (maximum risk)
 */
function scoreRisk(
  description: string,
  riskIndicators: string[] | undefined,
): number {
  const lower = description.toLowerCase();
  let count = 0;

  for (const keyword of RISK_KEYWORDS) {
    if (lower.includes(keyword)) {
      count++;
    }
  }

  // Add explicit risk indicators
  if (riskIndicators) {
    count += riskIndicators.length;
  }

  // Normalize: 0 = 0.0, 1 = 0.2, 2 = 0.4, 3 = 0.6, 4 = 0.8, 5+ = 1.0
  return Math.min(count / 5, 1.0);
}

/**
 * Score novelty dimension.
 *
 * Estimates task novelty from dependency count and roadmap phase data.
 * Higher dependency counts and task counts suggest more novel/complex work.
 *
 * @param input - Classifier input containing dependency and roadmap data
 * @returns Score from 0.0 (routine) to 1.0 (highly novel)
 */
function scoreNovelty(input: ClassifierInput): number {
  let score = 0.0;

  // Dependency count contributes to novelty
  if (input.dependency_count !== undefined) {
    if (input.dependency_count >= 5) score += 0.5;
    else if (input.dependency_count >= 2) score += 0.3;
    else if (input.dependency_count >= 1) score += 0.1;
  }

  // Roadmap phase data contributes to novelty
  if (input.roadmap_phase) {
    const { task_count, dependencies } = input.roadmap_phase;
    if (task_count !== undefined && task_count >= 10) score += 0.3;
    else if (task_count !== undefined && task_count >= 5) score += 0.15;

    if (dependencies !== undefined && dependencies >= 3) score += 0.2;
    else if (dependencies !== undefined && dependencies >= 1) score += 0.1;
  }

  return Math.min(score, 1.0);
}

// ─── Core Classifier ────────────────────────────────────────────────────────

/**
 * Classify task complexity using weighted-sum scoring.
 *
 * Computes a composite score across five signal dimensions (keyword,
 * file_scope, cross_cutting, risk, novelty), applies configurable
 * weights, and maps the result to a complexity level via thresholds.
 *
 * @param input - Validated classifier input
 * @returns Classifier output with complexity, route, score, and signal breakdown
 *
 * @example
 * ```typescript
 * const result = classifyComplexity({
 *   description: "fix a typo in README",
 * });
 * // result.complexity === "TRIVIAL"
 * // result.route === "direct"
 * ```
 */
export function classifyComplexity(input: ClassifierInput): ClassifierOutput {
  // Apply default weights via safeParse with fallback
  const weightsResult = classifierWeightsSchema.safeParse({});
  const weights: ClassifierWeights = weightsResult.success
    ? weightsResult.data
    : {
        keyword: 0.2,
        file_scope: 0.3,
        cross_cutting: 0.2,
        risk: 0.15,
        novelty: 0.15,
      };

  const thresholdsResult = classifierThresholdsSchema.safeParse({});
  const thresholds: ClassifierThresholds = thresholdsResult.success
    ? thresholdsResult.data
    : { TRIVIAL: 0.2, SIMPLE: 0.4, MODERATE: 0.6, COMPLEX: 0.8, CRITICAL: 1.0 };

  // Compute per-signal scores
  const { score: keywordScore } = scoreKeywords(input.description);
  const fileScopeScore = scoreFileScope(input.file_count);
  const crossCuttingScore = scoreCrossCutting(input.cross_cutting_scope);
  const riskScore = scoreRisk(input.description, input.risk_indicators);
  const noveltyScore = scoreNovelty(input);

  // Weighted sum
  const compositeScore =
    keywordScore * weights.keyword +
    fileScopeScore * weights.file_scope +
    crossCuttingScore * weights.cross_cutting +
    riskScore * weights.risk +
    noveltyScore * weights.novelty;

  // Map score to complexity level via thresholds
  let complexity: ComplexityLevel = "CRITICAL";
  if (compositeScore < thresholds.TRIVIAL) {
    complexity = "TRIVIAL";
  } else if (compositeScore < thresholds.SIMPLE) {
    complexity = "SIMPLE";
  } else if (compositeScore < thresholds.MODERATE) {
    complexity = "MODERATE";
  } else if (compositeScore < thresholds.COMPLEX) {
    complexity = "COMPLEX";
  }

  // Route determination
  const route = compositeScore < 0.4 ? "direct" : "phased";

  return {
    complexity,
    route,
    score: Math.round(compositeScore * 1000) / 1000,
    signals: {
      keyword: Math.round(keywordScore * 1000) / 1000,
      file_scope: Math.round(fileScopeScore * 1000) / 1000,
      cross_cutting: Math.round(crossCuttingScore * 1000) / 1000,
      risk: Math.round(riskScore * 1000) / 1000,
      novelty: Math.round(noveltyScore * 1000) / 1000,
    },
  };
}

// ─── CLI Entry Point ────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);

  /**
   * Parse a CLI argument of the form --key=value.
   *
   * @param flag - Flag name without -- prefix
   * @returns The value string, or undefined if not found
   */
  function getArg(flag: string): string | undefined {
    const prefix = `--${flag}=`;
    const arg = args.find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
  }

  const description = getArg("description");
  if (!description) {
    console.error(
      "Usage: bun classify.ts --description=<text> [--file-count=N] [--scope=a,b,c] [--risk=a,b] [--dependency-count=N]",
    );
    process.exit(1);
  }

  const rawInput = {
    description,
    file_count: getArg("file-count")
      ? parseInt(getArg("file-count")!, 10)
      : undefined,
    cross_cutting_scope: getArg("scope")
      ? getArg("scope")!.split(",").filter(Boolean)
      : undefined,
    risk_indicators: getArg("risk")
      ? getArg("risk")!.split(",").filter(Boolean)
      : undefined,
    dependency_count: getArg("dependency-count")
      ? parseInt(getArg("dependency-count")!, 10)
      : undefined,
  };

  const parseResult = classifierInputSchema.safeParse(rawInput);
  if (!parseResult.success) {
    console.error("Invalid input:", parseResult.error.issues);
    process.exit(1);
  }

  const result = classifyComplexity(parseResult.data);
  console.log(JSON.stringify(result, null, 2));
}
