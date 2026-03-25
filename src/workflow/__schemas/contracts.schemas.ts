/**
 * Step contract schemas for the workflow DAG pipeline.
 *
 * Each workflow phase declares typed output schemas. The DAG validator
 * checks schema compatibility at build time, and the DAG executor
 * validates outputs at runtime via safeParse.
 *
 * Schemas defined here:
 * - ClassifyOutputSchema: complexity classification result
 * - DiscussOutputSchema: context assembly and appetite result
 * - PlanOutputSchema: plan discovery result
 * - ExecuteOutputSchema: execution result with harness status
 * - VerifyOutputSchema: verification result with gaps
 * - LearnOutputSchema: learning capture counts
 * - CommitOutputSchema: commit result
 *
 * NOTE (Risk 11): These schemas are initial approximations. They will
 * require 2-3 revision cycles once tested against real workflow data.
 * The DAG executor should start in "warn" mode (log mismatches, don't fail)
 * and tighten to "strict" mode once schemas stabilize.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Step Contracts
 * @see docs/runtime-architecture/research/risk-analysis.md — Risk 11
 */

import { z } from "zod";

// ─── Classify Output ─────────────────────────────────────────────────────────

/**
 * Output of the classify/routing step.
 *
 * Produced by lu-router. Determines task complexity and model tier
 * for all downstream steps.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Step Contracts
 */
export const ClassifyOutputSchema = z.object({
  /** Assessed complexity level of the task. */
  complexity: z.enum(["TRIVIAL", "SIMPLE", "MODERATE", "COMPLEX", "CRITICAL"]),

  /** Reasoning for the complexity classification. */
  reasoning: z.string(),

  /** Model tier to use for downstream steps. */
  modelTier: z.enum(["fast", "balanced", "capable"]),
});

export type ClassifyOutput = z.infer<typeof ClassifyOutputSchema>;

// ─── Appetite ────────────────────────────────────────────────────────────────

/**
 * Appetite configuration determined during the discuss phase.
 */
export const AppetiteSchema = z.object({
  /** Appetite level label. */
  level: z.enum(["Micro", "Small", "Medium", "Large", "XL"]),

  /** Maximum token budget for the task. */
  tokenCeiling: z.number().int().positive(),

  /** Target context utilization percentage. */
  contextPercent: z.number().min(0).max(100),
});

export type Appetite = z.infer<typeof AppetiteSchema>;

// ─── Discuss Output ──────────────────────────────────────────────────────────

/**
 * Output of the discuss step.
 *
 * Produced by phase-discuss. Assembles context, determines appetite,
 * and optionally runs a premortem.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Step Contracts
 */
export const DiscussOutputSchema = z.object({
  /** Path to the generated context document. */
  contextPath: z.string(),

  /** Appetite configuration for the task. */
  appetite: AppetiteSchema,

  /** Path to the premortem document (if premortem gate was enabled). */
  premortemPath: z.string().optional(),
});

export type DiscussOutput = z.infer<typeof DiscussOutputSchema>;

// ─── Plan Output ─────────────────────────────────────────────────────────────

/**
 * Output of the plan step.
 *
 * Produced by phase-plan. Discovers and groups tasks into waves.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Step Contracts
 */
export const PlanOutputSchema = z.object({
  /** Paths to the generated plan files. */
  planPaths: z.array(z.string()),

  /** Number of execution waves in the plan. */
  waveCount: z.number().int().nonnegative(),

  /** Total number of tasks across all waves. */
  totalTasks: z.number().int().nonnegative(),
});

export type PlanOutput = z.infer<typeof PlanOutputSchema>;

// ─── Execute Output ──────────────────────────────────────────────────────────

/**
 * Output of the execute step.
 *
 * Produced by phase-execute. Contains execution summaries,
 * commit hashes, and harness verification status.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Step Contracts
 */
export const ExecuteOutputSchema = z.object({
  /** Paths to execution summary files. */
  summaryPaths: z.array(z.string()),

  /** Git commit hashes produced during execution. */
  commitHashes: z.array(z.string()),

  /** Harness verification outcome. */
  harnessStatus: z.enum(["passed", "failed_after_fixes"]),

  /** Number of errors remaining after harness fix iterations. */
  remainingErrors: z.number().int().nonnegative(),
});

export type ExecuteOutput = z.infer<typeof ExecuteOutputSchema>;

// ─── Verification Gap ────────────────────────────────────────────────────────

/**
 * A single gap found during verification.
 */
export const VerificationGapSchema = z.object({
  /** Description of the gap. */
  description: z.string(),

  /** Path to the source plan that relates to this gap. */
  sourcePlan: z.string().optional(),
});

export type VerificationGap = z.infer<typeof VerificationGapSchema>;

// ─── Verify Output ───────────────────────────────────────────────────────────

/**
 * Output of the verify step.
 *
 * Produced by lu-verifier. Determines whether execution met the plan
 * requirements and identifies gaps.
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — Step Contracts
 */
export const VerifyOutputSchema = z.object({
  /** Overall verification status. */
  status: z.enum(["passed", "human_needed", "gaps_found"]),

  /** Path to the verification report file. */
  verificationPath: z.string(),

  /** Verification score (e.g., "8/10", "PASS"). */
  score: z.string(),

  /** Gaps found during verification. */
  gaps: z.array(VerificationGapSchema).default([]),
});

export type VerifyOutput = z.infer<typeof VerifyOutputSchema>;

// ─── Learn Output ────────────────────────────────────────────────────────────

/**
 * Output of the learn step.
 *
 * Produced by lu-learner. Captures patterns, pitfalls, and decisions
 * into MuninnDB for long-term memory.
 */
export const LearnOutputSchema = z.object({
  /** Number of pattern engrams stored. */
  patternsStored: z.number().int().nonnegative(),

  /** Number of pitfall engrams stored. */
  pitfallsStored: z.number().int().nonnegative(),

  /** Number of decision engrams stored. */
  decisionsStored: z.number().int().nonnegative(),
});

export type LearnOutput = z.infer<typeof LearnOutputSchema>;

// ─── Commit Output ───────────────────────────────────────────────────────────

/**
 * Output of the commit step.
 *
 * Produced by git-commit. Contains the final commit information.
 * commitHash is optional because the step may determine nothing needs
 * to be committed.
 */
export const CommitOutputSchema = z.object({
  /** Git commit hash (absent if no commit was made). */
  commitHash: z.string().optional(),

  /** Name of the current git branch. */
  branchName: z.string(),

  /** Number of files changed in the commit. */
  filesChanged: z.number().int().nonnegative(),
});

export type CommitOutput = z.infer<typeof CommitOutputSchema>;
