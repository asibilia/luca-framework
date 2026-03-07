/**
 * Core type definitions for the Luca context module.
 *
 * Context tiers (T0-T3) parallel cognition tiers and control how much
 * contextual information is assembled for each sub-agent invocation.
 * Higher tiers include more documents (brain identity, recalled engrams,
 * STATE, session context) at the cost of token budget. Isolation modes
 * restrict document sets for security-sensitive or cold-start agents.
 *
 * All types are derived from Zod schemas via `z.infer`. No standalone
 * interface definitions. This module is standalone at type level --
 * it does NOT import from agent.schemas or complexity/.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Context tier constants
// ---------------------------------------------------------------------------

/** The four context tiers, from minimal to fully-loaded */
export const CONTEXT_TIERS = ["T0", "T1", "T2", "T3"] as const;

/** Zod enum for context tiers */
export const contextTierSchema = z.enum(CONTEXT_TIERS);

/** Context tier type derived from schema */
export type ContextTier = z.infer<typeof contextTierSchema>;

/** Numeric index for tier comparison (T0=0, T3=3) */
export const CONTEXT_TIER_ORDER: Record<ContextTier, number> = {
  T0: 0,
  T1: 1,
  T2: 2,
  T3: 3,
};

// ---------------------------------------------------------------------------
// Isolation modes
// ---------------------------------------------------------------------------

/** Isolation modes control document filtering for sensitive agents */
export const ISOLATION_MODES = ["none", "cold", "warm"] as const;

/** Zod enum for isolation modes */
export const isolationModeSchema = z.enum(ISOLATION_MODES);

/** Isolation mode type derived from schema */
export type IsolationMode = z.infer<typeof isolationModeSchema>;

// ---------------------------------------------------------------------------
// Configuration schemas
// ---------------------------------------------------------------------------

/**
 * Per-agent context configuration.
 *
 * Defines the default context tier, the maximum tier the agent can be
 * promoted to by complexity gating, and the isolation mode.
 *
 * Uses snake_case for API compatibility.
 */
export const contextConfigSchema = z.object({
  /** Default context tier for this agent */
  default_tier: contextTierSchema.default("T0"),
  /** Maximum tier this agent can be promoted to */
  promotable_to: contextTierSchema.default("T0"),
  /** Isolation mode: none (full access), cold (minimal), warm (partial) */
  isolation: isolationModeSchema.default("none"),
});

/** Context configuration type derived from schema */
export type ContextConfig = z.infer<typeof contextConfigSchema>;

/**
 * Token budget allocation for a sub-agent invocation.
 *
 * Controls how the total token budget is split between context documents
 * and output reservation. The advisory flag indicates whether the budget
 * is a hard limit or a soft guideline.
 *
 * Uses snake_case for API compatibility.
 */
export const budgetAllocationSchema = z.object({
  /** Total token budget for the invocation */
  total_tokens: z.number().int().positive(),
  /** Fraction of budget reserved for output (0.25 to 0.5) */
  output_reservation_pct: z.number().min(0.25).max(0.5).default(0.3),
  /** Whether the budget is advisory (soft) or enforced (hard) */
  advisory: z.boolean().default(false),
});

/** Budget allocation type derived from schema */
export type BudgetAllocation = z.infer<typeof budgetAllocationSchema>;

/**
 * The complete set of context documents that can be assembled for an agent.
 *
 * Each field is optional -- which fields are populated depends on the
 * resolved context tier and isolation mode. Higher tiers include more
 * documents. Some fields are mutually exclusive (e.g., brain_summary vs
 * brain_full).
 *
 * Uses snake_case for API compatibility.
 */
export const contextDocumentSetSchema = z.object({
  /** The plan content (PLAN.md or current phase plan) */
  plan_content: z.string().optional(),
  /** Condensed brain identity from MuninnDB */
  brain_summary: z.string().optional(),
  /** STATE.md content */
  state_content: z.string().optional(),
  /** Selectively recalled engrams from MuninnDB */
  memory_entries: z.string().optional(),
  /** Session context from MuninnDB */
  working_content: z.string().optional(),
  /** Full brain identity tree from MuninnDB (replaces brain_summary at T3) */
  brain_full: z.string().optional(),
  /** Full recalled engrams from MuninnDB (replaces memory_entries at T3) */
  memory_full: z.string().optional(),
  /** Summaries of other agents in the workflow */
  agent_summaries: z.string().optional(),
  /** Git diff for cold-start context */
  git_diff: z.string().optional(),
  /** Summaries of related plans */
  plan_summaries: z.string().optional(),
});

/** Context document set type derived from schema */
export type ContextDocumentSet = z.infer<typeof contextDocumentSetSchema>;

// ---------------------------------------------------------------------------
// Pre-flight hydration schemas
// ---------------------------------------------------------------------------

/**
 * Configuration for pre-flight context hydration.
 *
 * Controls which deterministic codebase snapshots are collected before
 * major operations. Parameters scale with task complexity.
 *
 * Uses snake_case for API compatibility.
 */
export const hydrationConfigSchema = z.object({
  /** Maximum depth for file tree traversal */
  file_tree_depth: z.number().int().min(1).max(10).default(3),
  /** Whether to discover test files */
  include_tests: z.boolean().default(false),
  /** Number of recent git commits to include */
  git_history_count: z.number().int().min(0).max(50).default(10),
  /** Whether to extract the import dependency graph */
  include_imports: z.boolean().default(false),
});

/** Hydration configuration type derived from schema */
export type HydrationConfig = z.infer<typeof hydrationConfigSchema>;

/**
 * A single entry in the file tree snapshot.
 *
 * Uses snake_case for API compatibility.
 */
export const fileTreeEntrySchema = z.object({
  /** Relative file path from project root */
  path: z.string(),
  /** Entry type: "blob" for file, "tree" for directory */
  type: z.enum(["blob", "tree"]),
});

/** File tree entry type derived from schema */
export type FileTreeEntry = z.infer<typeof fileTreeEntrySchema>;

/**
 * A single git commit summary.
 *
 * Uses snake_case for API compatibility.
 */
export const gitCommitSummarySchema = z.object({
  /** Short commit hash */
  hash: z.string(),
  /** Commit subject line */
  subject: z.string(),
  /** Author name */
  author: z.string(),
  /** ISO 8601 date string */
  date: z.string(),
});

/** Git commit summary type derived from schema */
export type GitCommitSummary = z.infer<typeof gitCommitSummarySchema>;

/**
 * An edge in the import dependency graph.
 *
 * Uses snake_case for API compatibility.
 */
export const importEdgeSchema = z.object({
  /** Source file (the importing file) */
  source: z.string(),
  /** Target module specifier (the imported module) */
  target: z.string(),
});

/** Import edge type derived from schema */
export type ImportEdge = z.infer<typeof importEdgeSchema>;

/**
 * Complete pre-flight hydration snapshot.
 *
 * Collected before major operations to provide deterministic codebase
 * context. Content scales based on HydrationConfig parameters.
 *
 * Uses snake_case for API compatibility.
 */
export const preFlightSnapshotSchema = z.object({
  /** File tree entries from git ls-tree */
  file_tree: z.array(fileTreeEntrySchema).default([]),
  /** Discovered test file paths */
  test_files: z.array(z.string()).default([]),
  /** Recent git commit summaries */
  git_history: z.array(gitCommitSummarySchema).default([]),
  /** Import dependency graph edges */
  import_graph: z.array(importEdgeSchema).default([]),
  /** Timestamp of snapshot creation (ISO 8601) */
  created_at: z.string(),
});

/** Pre-flight snapshot type derived from schema */
export type PreFlightSnapshot = z.infer<typeof preFlightSnapshotSchema>;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Check if a context tier meets or exceeds a threshold tier.
 *
 * @param tier - The tier to check
 * @param threshold - The minimum required tier
 * @returns true if tier >= threshold
 *
 * @example
 * ```typescript
 * meetsContextThreshold("T2", "T1") // true
 * meetsContextThreshold("T0", "T1") // false
 * meetsContextThreshold("T3", "T3") // true
 * ```
 */
export function meetsContextThreshold(
  tier: ContextTier,
  threshold: ContextTier,
): boolean {
  return CONTEXT_TIER_ORDER[tier] >= CONTEXT_TIER_ORDER[threshold];
}

/**
 * Return the higher of two context tiers.
 *
 * @param a - First tier
 * @param b - Second tier
 * @returns The tier with the higher numeric order
 *
 * @example
 * ```typescript
 * maxContextTier("T1", "T2") // "T2"
 * maxContextTier("T3", "T0") // "T3"
 * ```
 */
export function maxContextTier(a: ContextTier, b: ContextTier): ContextTier {
  return CONTEXT_TIER_ORDER[a] >= CONTEXT_TIER_ORDER[b] ? a : b;
}
