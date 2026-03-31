/**
 * Zod schemas for the Luca Scout pipeline state machine.
 *
 * Defines the per-article and cross-cutting states that an article moves through
 * during the Scout pipeline, along with transition validation, artifact tracking,
 * and history recording.
 *
 * Each article is persisted as `.scout-state/{slug}.json` and validated against
 * `ScoutStateFileSchema`. The `validateScoutTransition` function enforces the
 * directed acyclic transition graph defined in `SCOUT_TRANSITIONS`.
 *
 * Uses snake_case for data schema compatibility (persisted JSON files).
 * T0-compliant: imports nothing from src/.
 *
 * @example
 * ```typescript
 * import {
 *   ScoutStateFileSchema,
 *   validateScoutTransition,
 * } from "~/shared";
 *
 * const file = ScoutStateFileSchema.parse({
 *   url: "https://example.com/article",
 *   slug: "example-article",
 *   created_at: new Date().toISOString(),
 *   updated_at: new Date().toISOString(),
 * });
 * // file.current_state === "PENDING" (default)
 *
 * const result = validateScoutTransition("PENDING", "INGESTED");
 * // { valid: true }
 *
 * const bad = validateScoutTransition("PENDING", "READY");
 * // { valid: false, reason: "..." }
 * ```
 */
import { z } from "zod";

// ─── Scout State Enum ──────────────────────────────────────────────────────────

/**
 * All states an article can occupy in the Scout pipeline.
 *
 * Per-article states (linear progression):
 * - PENDING: Article URL ingested, not yet processed
 * - INGESTED: Raw content fetched and stored
 * - RELEVANCE_CHECKED: Relevance score computed; may branch to LOW_RELEVANCE
 * - RESEARCHED: Deep research completed on the article's topic
 * - ANALYZED: Impact analysis and codebase mapping complete
 * - IMPL_RESEARCHED: Implementation research with concrete code patterns
 * - READY: Per-article pipeline complete, awaiting cross-cutting batch
 *
 * Cross-cutting states (batch processing):
 * - INTEGRATION_ANALYZED: Cross-article integration analysis complete
 * - TODOS_CREATED: Work items created from analysis
 * - MEMORY_CAPTURED: Findings stored in MuninnDB
 * - INDEXED: Added to scout index for tracking
 * - COMPLETE: Fully processed, terminal state
 *
 * Terminal states (no further transitions):
 * - LOW_RELEVANCE: Article scored below relevance threshold
 * - DEFERRED: Valid but intentionally postponed
 * - CONFLICTING: Article conflicts with existing patterns or decisions
 */
export const ScoutStateSchema = z.enum([
  // Per-article states
  "PENDING",
  "INGESTED",
  "RELEVANCE_CHECKED",
  "RESEARCHED",
  "ANALYZED",
  "IMPL_RESEARCHED",
  "READY",
  // Cross-cutting states
  "INTEGRATION_ANALYZED",
  "TODOS_CREATED",
  "MEMORY_CAPTURED",
  "INDEXED",
  "COMPLETE",
  // Terminal states
  "LOW_RELEVANCE",
  "DEFERRED",
  "CONFLICTING",
]);

/** Inferred TypeScript type for a Scout pipeline state. */
export type ScoutState = z.infer<typeof ScoutStateSchema>;

// ─── State Groupings ───────────────────────────────────────────────────────────

/**
 * Per-article pipeline states (PENDING through READY).
 *
 * These states represent the linear progression of a single article
 * through individual analysis before it enters the cross-cutting batch.
 */
export const PER_ARTICLE_STATES: readonly ScoutState[] = [
  "PENDING",
  "INGESTED",
  "RELEVANCE_CHECKED",
  "RESEARCHED",
  "ANALYZED",
  "IMPL_RESEARCHED",
  "READY",
] as const;

/**
 * Cross-cutting batch states (INTEGRATION_ANALYZED through COMPLETE).
 *
 * These states represent multi-article batch processing after all
 * per-article pipelines reach READY. READY is included as the entry
 * point into cross-cutting processing.
 */
export const CROSS_CUTTING_STATES: readonly ScoutState[] = [
  "INTEGRATION_ANALYZED",
  "TODOS_CREATED",
  "MEMORY_CAPTURED",
  "INDEXED",
  "COMPLETE",
] as const;

/**
 * Terminal states that permit no further transitions.
 *
 * An article in a terminal state is considered finished (successfully
 * or otherwise) and will not be processed further by the pipeline.
 */
export const TERMINAL_STATES: readonly ScoutState[] = [
  "LOW_RELEVANCE",
  "DEFERRED",
  "CONFLICTING",
  "COMPLETE",
] as const;

// ─── Transition Table ──────────────────────────────────────────────────────────

/**
 * Directed acyclic transition graph for the Scout pipeline.
 *
 * Maps each state to an array of valid next states. Terminal states
 * map to empty arrays. The pipeline is linear except for branching
 * at RELEVANCE_CHECKED (to LOW_RELEVANCE) and INTEGRATION_ANALYZED
 * (to DEFERRED or CONFLICTING).
 *
 * @example
 * ```typescript
 * const nextStates = SCOUT_TRANSITIONS["RELEVANCE_CHECKED"];
 * // ["RESEARCHED", "LOW_RELEVANCE"]
 * ```
 */
export const SCOUT_TRANSITIONS: Readonly<
  Record<ScoutState, readonly ScoutState[]>
> = {
  // Per-article progression
  PENDING: ["INGESTED"],
  INGESTED: ["RELEVANCE_CHECKED"],
  RELEVANCE_CHECKED: ["RESEARCHED", "LOW_RELEVANCE"],
  RESEARCHED: ["ANALYZED"],
  ANALYZED: ["IMPL_RESEARCHED"],
  IMPL_RESEARCHED: ["READY"],
  // Cross-cutting progression
  READY: ["INTEGRATION_ANALYZED"],
  INTEGRATION_ANALYZED: ["TODOS_CREATED", "DEFERRED", "CONFLICTING"],
  TODOS_CREATED: ["MEMORY_CAPTURED"],
  MEMORY_CAPTURED: ["INDEXED"],
  INDEXED: ["COMPLETE"],
  // Terminal states (no outgoing transitions)
  LOW_RELEVANCE: [],
  DEFERRED: [],
  CONFLICTING: [],
  COMPLETE: [],
} as const;

// ─── State History Entry ───────────────────────────────────────────────────────

/**
 * A single state transition record in an article's history.
 *
 * Captures the source state, target state, timestamp, and optionally
 * which agent performed the transition. History entries are append-only.
 *
 * Uses snake_case for data schema compatibility.
 */
export const ScoutStateHistoryEntrySchema = z.object({
  /** The state the article transitioned from. */
  from: ScoutStateSchema,
  /** The state the article transitioned to. */
  to: ScoutStateSchema,
  /** ISO 8601 timestamp when the transition occurred. */
  timestamp: z.string(),
  /** Name of the agent that performed the transition, if known. */
  agent: z.string().optional(),
});

/** Inferred TypeScript type for a state history entry. */
export type ScoutStateHistoryEntry = z.infer<
  typeof ScoutStateHistoryEntrySchema
>;

// ─── Artifacts ─────────────────────────────────────────────────────────────────

/**
 * Paths to artifacts produced during the Scout pipeline.
 *
 * Each field is optional because artifacts are created at different
 * pipeline stages. The `todo_paths` array defaults to empty since
 * an article may produce zero or many todo files.
 *
 * Uses snake_case for data schema compatibility.
 */
export const ScoutArtifactsSchema = z.object({
  /** Path to the digest markdown file produced during RESEARCHED stage. */
  digest_path: z.string().optional(),
  /** Path to the impact analysis file produced during ANALYZED stage. */
  impact_path: z.string().optional(),
  /** Path to the integration analysis file produced during INTEGRATION_ANALYZED stage. */
  integration_path: z.string().optional(),
  /** Path to the deferral rationale file when state is DEFERRED. */
  deferred_path: z.string().optional(),
  /** Path to the manual review file when state is CONFLICTING. */
  manual_review_path: z.string().optional(),
  /** Paths to todo files created during TODOS_CREATED stage. */
  todo_paths: z.array(z.string()).default([]),
});

/** Inferred TypeScript type for Scout pipeline artifacts. */
export type ScoutArtifacts = z.infer<typeof ScoutArtifactsSchema>;

// ─── State File ────────────────────────────────────────────────────────────────

/**
 * Full persisted state for a single Scout article.
 *
 * Stored at `.scout-state/{slug}.json`. This is the root schema for
 * the per-article state file. It tracks the article's URL, slug,
 * current pipeline state, transition history, and produced artifacts.
 *
 * Uses snake_case for data schema compatibility.
 *
 * @example
 * ```typescript
 * const stateFile = ScoutStateFileSchema.parse({
 *   url: "https://bun.sh/blog/bun-v1.2",
 *   slug: "bun-v1-2",
 *   created_at: "2026-03-30T10:00:00Z",
 *   updated_at: "2026-03-30T10:00:00Z",
 * });
 * // stateFile.current_state === "PENDING"
 * // stateFile.history === []
 * // stateFile.artifacts === { todo_paths: [] }
 * // stateFile.title === ""
 * ```
 */
export const ScoutStateFileSchema = z.object({
  /** Original article URL. */
  url: z.string().url(),
  /** URL-safe slug derived from the article title or URL. */
  slug: z.string(),
  /** Human-readable article title. */
  title: z.string().default(""),
  /** Current pipeline state. */
  current_state: ScoutStateSchema.default("PENDING"),
  /** Ordered list of state transitions (append-only). */
  history: z.array(ScoutStateHistoryEntrySchema).default([]),
  /** Paths to artifacts produced at each pipeline stage. */
  artifacts: ScoutArtifactsSchema.default({ todo_paths: [] }),
  /** ISO 8601 timestamp when the state file was first created. */
  created_at: z.string(),
  /** ISO 8601 timestamp when the state file was last updated. */
  updated_at: z.string(),
});

/** Inferred TypeScript type for a persisted Scout state file. */
export type ScoutStateFile = z.infer<typeof ScoutStateFileSchema>;

// ─── Transition Validation ─────────────────────────────────────────────────────

/**
 * Validates whether a state transition is permitted by the Scout pipeline graph.
 *
 * Checks `SCOUT_TRANSITIONS[currentState]` for the presence of `targetState`.
 * Returns `{ valid: true }` when the transition is allowed, or
 * `{ valid: false, reason: string }` with a human-readable explanation.
 *
 * @param currentState - The article's current pipeline state
 * @param targetState - The desired next state
 * @returns Validation result with optional reason on failure
 *
 * @example
 * ```typescript
 * const ok = validateScoutTransition("PENDING", "INGESTED");
 * // { valid: true }
 *
 * const bad = validateScoutTransition("PENDING", "READY");
 * // { valid: false, reason: "Invalid transition: PENDING -> READY. Valid targets from PENDING: INGESTED" }
 *
 * const terminal = validateScoutTransition("COMPLETE", "PENDING");
 * // { valid: false, reason: "Invalid transition: COMPLETE -> PENDING. COMPLETE is a terminal state with no outgoing transitions" }
 * ```
 */
export const validateScoutTransition = (
  currentState: ScoutState,
  targetState: ScoutState,
): { valid: boolean; reason?: string } => {
  const validTargets = SCOUT_TRANSITIONS[currentState];

  if (validTargets.includes(targetState)) {
    return { valid: true };
  }

  if (validTargets.length === 0) {
    return {
      valid: false,
      reason: `Invalid transition: ${currentState} -> ${targetState}. ${currentState} is a terminal state with no outgoing transitions`,
    };
  }

  return {
    valid: false,
    reason: `Invalid transition: ${currentState} -> ${targetState}. Valid targets from ${currentState}: ${validTargets.join(", ")}`,
  };
};
