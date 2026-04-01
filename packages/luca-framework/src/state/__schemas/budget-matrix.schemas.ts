/**
 * Budget Matrix schemas for the /lu orchestrator.
 *
 * Defines the base iteration limits by complexity, profile multipliers,
 * task sizing constraints, and convergence override types. These schemas
 * are the single source of truth for the budget matrix specified in
 * Section 7 of the v9.0.0 workflow spec (06-final-workflow.md).
 *
 * Uses snake_case for all schema fields per API conventions.
 *
 * @module luca-state/__schemas/budget-matrix.schemas
 */
import { z } from "zod";

// ─── Complexity Levels (local re-declaration for self-containment) ──────────

/**
 * NOTE (DRY-002): BUDGET_COMPLEXITY_LEVELS and BUDGET_PROFILES are local
 * re-declarations for JSON-serializable self-containment. The canonical
 * complexity levels live in `src/complexity/__schemas/complexity.schemas.ts`
 * and token profiles in `src/complexity/__helpers/token-profile.ts`.
 * Keep in sync manually. Full consolidation requires a shared package.
 */
export const BUDGET_COMPLEXITY_LEVELS = [
  "TRIVIAL",
  "SIMPLE",
  "MODERATE",
  "COMPLEX",
  "CRITICAL",
] as const;
export const budgetComplexitySchema = z.enum(BUDGET_COMPLEXITY_LEVELS);
export type BudgetComplexity = z.infer<typeof budgetComplexitySchema>;

// ─── Token Profiles ─────────────────────────────────────────────────────────

export const BUDGET_PROFILES = ["budget", "balanced", "quality"] as const;
export const budgetProfileSchema = z.enum(BUDGET_PROFILES);
export type BudgetProfile = z.infer<typeof budgetProfileSchema>;

// ─── Base Budget Limits ─────────────────────────────────────────────────────

/**
 * Base iteration limits for a single complexity level.
 *
 * These are the raw values before profile multipliers are applied.
 * Uses snake_case for all fields per API conventions.
 */
export const baseBudgetLimitsSchema = z.object({
  /** Maximum outer implementation loop iterations (5h-5k cycle) */
  max_impl_iterations: z.number().int().nonnegative(),
  /** Maximum harness fix loop iterations (5i) */
  harness_fix_iterations: z.number().int().nonnegative(),
  /** Maximum review fix loop iterations (5m) */
  review_fix_iterations: z.number().int().nonnegative(),
  /** Maximum files per task (NOT profile-modified) */
  max_files_per_task: z.number().int().positive(),
  /** Maximum tasks per wave (NOT profile-modified) */
  max_tasks_per_wave: z.number().int().positive(),
});
export type BaseBudgetLimits = z.infer<typeof baseBudgetLimitsSchema>;

// ─── Resolved Budget ────────────────────────────────────────────────────────

/**
 * Resolved budget limits after profile multiplier is applied.
 *
 * Loop iteration limits are multiplied by the profile factor with floor(1) minimum.
 * Task sizing limits are passed through unchanged (not profile-modified).
 * Uses snake_case for all fields per API conventions.
 */
export const resolvedBudgetSchema = z.object({
  /** Effective max outer implementation iterations (profile-modified) */
  max_impl_iterations: z.number().int().positive(),
  /** Effective max harness fix iterations (profile-modified) */
  harness_fix_iterations: z.number().int().positive(),
  /** Effective max review fix iterations (profile-modified, can be 0 for TRIVIAL) */
  review_fix_iterations: z.number().int().nonnegative(),
  /** Max files per task (NOT profile-modified) */
  max_files_per_task: z.number().int().positive(),
  /** Max tasks per wave (NOT profile-modified) */
  max_tasks_per_wave: z.number().int().positive(),
  /** The complexity level used for resolution */
  complexity: budgetComplexitySchema,
  /** The profile used for resolution */
  profile: budgetProfileSchema,
  /** The multiplier that was applied */
  multiplier: z.number().positive(),
});
export type ResolvedBudget = z.infer<typeof resolvedBudgetSchema>;

// ─── Convergence Override ───────────────────────────────────────────────────

/**
 * Budget status indicators for convergence override decisions.
 */
export const BUDGET_STATUS_VALUES = [
  "under_budget",
  "soft_stop",
  "exceeded",
] as const;
export const budgetStatusValueSchema = z.enum(BUDGET_STATUS_VALUES);

/**
 * Convergence signal indicators.
 */
export const CONVERGENCE_SIGNALS = [
  "progressing",
  "stalled",
  "unknown",
] as const;
export const convergenceSignalSchema = z.enum(CONVERGENCE_SIGNALS);

/**
 * Result of evaluating convergence against budget status.
 *
 * Determines whether the convergence signal should override the
 * budget status for loop continuation decisions.
 *
 * Uses snake_case for all fields per API conventions.
 */
export const convergenceOverrideResultSchema = z.object({
  /** Whether the loop should continue */
  should_continue: z.boolean(),
  /** Human-readable reason for the decision */
  reason: z.string(),
  /** Whether a convergence signal overrode the budget decision */
  override_applied: z.boolean().default(false),
});
export type ConvergenceOverrideResult = z.infer<
  typeof convergenceOverrideResultSchema
>;

// ─── CLI Input Schema ───────────────────────────────────────────────────────

/**
 * Input schema for the budget matrix CLI entry point.
 *
 * Used when the orchestrator calls the budget resolver via:
 * `bun src/state/__helpers/budget-matrix.ts --complexity=X --profile=Y`
 *
 * Uses snake_case for all fields per API conventions.
 */
export const budgetMatrixInputSchema = z.object({
  complexity: budgetComplexitySchema,
  profile: budgetProfileSchema.default("balanced"),
});
export type BudgetMatrixInput = z.infer<typeof budgetMatrixInputSchema>;
