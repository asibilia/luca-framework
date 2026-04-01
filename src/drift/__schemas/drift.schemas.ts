/**
 * Type definitions for the per-phase drift detection module.
 *
 * **Internal-only schemas** -- not used as API request/response payloads.
 * Uses camelCase per TypeScript conventions for internal runtime types.
 *
 * The drift checker compares git diff output from a completed phase against
 * file references in remaining phases to detect invalidation, blocking,
 * or redundancy. All data-shape types are derived from Zod schemas via
 * z.infer.
 *
 * @module drift-schemas
 */

import { z } from "zod";

// ─── Infrastructure Ignore List (DRIFT-05) ─────────────────────────────────

/**
 * Files ignored by default during drift detection unless they contain
 * structural changes (new path aliases, new workspaces, new entry points).
 *
 * These files change frequently (dependency updates, minor config tweaks)
 * without invalidating phase plans.
 */
export const INFRASTRUCTURE_IGNORE_LIST = [
  "tsconfig.json",
  "package.json",
  "bun.lock",
  "bunfig.toml",
  ".gitignore",
  ".prettierrc",
  ".eslintrc",
  ".editorconfig",
] as const;

/**
 * Patterns within infrastructure files that indicate structural changes.
 * When these patterns appear in the diff, the file is NOT ignored.
 *
 * @example
 * - Adding a new path alias in tsconfig.json ("paths")
 * - Adding a new workspace in package.json ("workspaces")
 * - Adding a new entry point ("exports", "main", "bin")
 */
export const STRUCTURAL_CHANGE_PATTERNS = [
  "paths",
  "workspaces",
  "exports",
  "main",
  "bin",
  "entry",
] as const;

// ─── Phase Info ─────────────────────────────────────────────────────────────

/**
 * Minimal phase metadata needed for drift comparison.
 *
 * Represents a remaining (not-yet-executed) phase with its file references
 * extracted from the plan.
 */
export const PhaseInfoSchema = z.object({
  /** Phase number (e.g., 266) */
  id: z.number(),
  /** Human-readable phase description (e.g., "Deterministic Crash Recovery") */
  description: z.string(),
  /** File paths referenced in this phase's plan (from @-references and inline mentions) */
  filePaths: z.array(z.string()),
});

export type PhaseInfo = z.infer<typeof PhaseInfoSchema>;

// ─── Drift Reason ───────────────────────────────────────────────────────────

/**
 * Classification of why a phase was affected by drift.
 */
export const DriftReasonKindSchema = z.enum([
  /** A file referenced by the phase was deleted */
  "deleted",
  /** A file referenced by the phase was renamed */
  "renamed",
  /** A file referenced by the phase was modified (may invalidate assumptions) */
  "modified",
  /** A dependency (import target) of a referenced file changed */
  "dependency_changed",
]);

export type DriftReasonKind = z.infer<typeof DriftReasonKindSchema>;

/**
 * A single drift reason describing one file-level change that affects a phase.
 */
export const DriftReasonSchema = z.object({
  /** The kind of drift detected */
  kind: DriftReasonKindSchema,
  /** The file path that changed */
  filePath: z.string(),
  /** Optional: new path if renamed */
  newPath: z.string().optional(),
  /** Human-readable explanation */
  detail: z.string(),
});

export type DriftReason = z.infer<typeof DriftReasonSchema>;

// ─── Affected Phase ─────────────────────────────────────────────────────────

/**
 * A phase affected by drift, with the reasons it was flagged.
 */
export const AffectedPhaseSchema = z.object({
  /** Phase number */
  phaseId: z.number(),
  /** Phase description */
  description: z.string(),
  /** List of reasons this phase is affected */
  reasons: z.array(DriftReasonSchema),
});

export type AffectedPhase = z.infer<typeof AffectedPhaseSchema>;

// ─── Reassessment Verdict ───────────────────────────────────────────────────

/**
 * Verdict from the reassessment agent for a single phase.
 */
export const PhaseVerdictKindSchema = z.enum([
  /** Phase is still valid, no changes needed */
  "VALID",
  /** Phase needs plan updates to account for changes */
  "NEEDS_UPDATE",
  /** Phase is redundant (work already done by completed phase) */
  "REDUNDANT",
  /** Phase is blocked (critical dependency deleted or incompatible) */
  "BLOCKED",
]);

export type PhaseVerdictKind = z.infer<typeof PhaseVerdictKindSchema>;

/**
 * Reassessment verdict for a single phase.
 */
export const PhaseVerdictSchema = z.object({
  /** Phase number */
  phaseId: z.number(),
  /** The verdict */
  verdict: PhaseVerdictKindSchema,
  /** Explanation of why this verdict was chosen */
  rationale: z.string(),
  /** Suggested updates if verdict is NEEDS_UPDATE */
  suggestedUpdates: z.array(z.string()).default([]),
});

export type PhaseVerdict = z.infer<typeof PhaseVerdictSchema>;

/**
 * Complete reassessment result from the lu-reassessor agent.
 *
 * Renamed to DriftReassessmentResult to avoid name collision with
 * ReassessmentResult in src/complexity/__schemas/complexity.schemas.ts
 * (which tracks complexity-level promotions, not drift verdicts).
 */
export const DriftReassessmentResultSchema = z.object({
  /** Verdicts for each affected phase */
  verdicts: z.array(PhaseVerdictSchema),
  /** Summary of reassessment */
  summary: z.string(),
});

export type DriftReassessmentResult = z.infer<
  typeof DriftReassessmentResultSchema
>;

/** @deprecated Use DriftReassessmentResultSchema instead. */
export const ReassessmentResultSchema = DriftReassessmentResultSchema;
/** @deprecated Use DriftReassessmentResult instead. */
export type ReassessmentResult = DriftReassessmentResult;

// ─── Drift Result ───────────────────────────────────────────────────────────

/**
 * Top-level result from the mechanical drift checker.
 *
 * This is a zero-LLM result: purely mechanical comparison of git diff
 * against file references in remaining phases.
 */
export const DriftResultSchema = z.object({
  /** Whether any drift was detected */
  drifted: z.boolean(),
  /** Files changed in the completed phase (after infrastructure filtering) */
  changedFiles: z.array(z.string()),
  /** Files that were deleted or renamed */
  deletedOrRenamed: z.array(
    z.object({
      oldPath: z.string(),
      newPath: z.string().optional(),
      status: z.enum(["deleted", "renamed"]),
    }),
  ),
  /** Phases affected by the changes */
  affectedPhases: z.array(AffectedPhaseSchema),
  /** Total number of remaining phases checked */
  totalPhasesChecked: z.number(),
  /** Files that were ignored due to infrastructure filter */
  ignoredInfraFiles: z.array(z.string()),
});

export type DriftResult = z.infer<typeof DriftResultSchema>;

// ─── Drift Event (for session ledger) ───────────────────────────────────────

/**
 * A drift event entry for the session ledger (JSONL format).
 */
export const DriftEventSchema = z.object({
  /** ISO timestamp */
  timestamp: z.string(),
  /** Event type */
  event: z.literal("DRIFT_DETECTED"),
  /** Phase that was just completed */
  completedPhase: z.number(),
  /** Number of affected phases */
  affectedPhaseCount: z.number(),
  /** IDs of affected phases */
  affectedPhaseIds: z.array(z.number()),
  /** Number of changed files that caused drift */
  changedFileCount: z.number(),
});

export type DriftEvent = z.infer<typeof DriftEventSchema>;
