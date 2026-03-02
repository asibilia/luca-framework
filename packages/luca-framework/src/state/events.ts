/**
 * Event-driven architecture functions for the Luca workflow state machine.
 *
 * Provides utilities for building structured transition records,
 * extracting context summaries, and describing transitions in
 * human-readable format.
 *
 * Uses snake_case for all output fields per API conventions.
 *
 * @module luca-state/events
 */
import { transitionRecordSchema } from "./types";
import type {
  TransitionRecord,
  WorkflowContext,
  OversightLevel,
} from "./types";

// ─── Context Summary ─────────────────────────────────────────────────────────

/**
 * Minimal context summary for transition records and audit logs.
 *
 * Contains only the fields useful for debugging and tracking,
 * excluding large objects like gates, complexity_matrix, and autopilot_config.
 *
 * Uses snake_case for all properties per API conventions.
 */
export interface ContextSummary {
  session_id: string;
  ticket_id: string | undefined;
  complexity: string;
  oversight: OversightLevel;
  current_phase: number | undefined;
  current_milestone: string | undefined;
  verification_attempts: number;
  phases_completed: number;
  suspend_metadata: WorkflowContext["suspend_metadata"];
  last_error: string | undefined;
}

/**
 * Extract a minimal context summary from the full workflow context.
 *
 * Returns only the fields useful for transition records and audit logs,
 * excluding large objects like gates, complexity_matrix, and autopilot_config.
 *
 * @param context - The full workflow context
 * @returns A minimal subset of context fields
 *
 * @example
 * ```typescript
 * const summary = extractContextSummary(snapshot.context);
 * // { session_id: "abc-123", complexity: "COMPLEX", ... }
 * ```
 */
export function extractContextSummary(
  context: WorkflowContext,
): ContextSummary {
  return {
    session_id: context.session_id,
    ticket_id: context.ticket_id,
    complexity: context.complexity,
    oversight: context.oversight,
    current_phase: context.current_phase,
    current_milestone: context.current_milestone,
    verification_attempts: context.verification_attempts,
    phases_completed: context.phase_results.length,
    suspend_metadata: context.suspend_metadata,
    last_error: context.last_error,
  };
}

// ─── Transition Record Builder ───────────────────────────────────────────────

/**
 * Build a validated TransitionRecord from transition data.
 *
 * Creates a structured record of a state machine transition, including
 * a minimal context summary (not the full context) and timestamps.
 * The record is validated against the transitionRecordSchema.
 *
 * @param previousState - The state before the transition
 * @param currentState - The state after the transition
 * @param eventType - The event type that triggered the transition
 * @param eventData - Additional event data (excluding the type field)
 * @param context - The full workflow context (will be summarized)
 * @param actionsExecuted - Optional list of action names that ran
 * @returns A validated TransitionRecord
 *
 * @example
 * ```typescript
 * const record = buildTransitionRecord(
 *   "idle",
 *   "preflight",
 *   "START",
 *   { ticket_id: "PROJ-1234" },
 *   snapshot.context,
 * );
 * // { previous_state: "idle", current_state: "preflight", ... }
 * ```
 */
export function buildTransitionRecord(
  previousState: string,
  currentState: string,
  eventType: string,
  eventData: Record<string, unknown> = {},
  context: WorkflowContext,
  actionsExecuted: string[] = [],
): TransitionRecord {
  const summary = extractContextSummary(context);
  // Internal construction — .parse() validates shape, data is computed (not external input)
  return transitionRecordSchema.parse({
    previous_state: previousState,
    current_state: currentState,
    event_type: eventType,
    event_data: eventData,
    actions_executed: actionsExecuted,
    context: summary,
    timestamp: new Date().toISOString(),
    session_id: context.session_id,
  });
}

// ─── Transition Utilities ────────────────────────────────────────────────────

/**
 * Check if a transition represents a meaningful state change.
 *
 * Returns false if the previous and current states are the same
 * (i.e., a self-transition or no-op), true otherwise.
 *
 * @param previousState - The state before the transition
 * @param currentState - The state after the transition
 * @returns true if the states differ, false if they are the same
 *
 * @example
 * ```typescript
 * isSignificantTransition("idle", "preflight"); // true
 * isSignificantTransition("idle", "idle");       // false
 * ```
 */
export function isSignificantTransition(
  previousState: string,
  currentState: string,
): boolean {
  return previousState !== currentState;
}

/**
 * Format a transition record into a human-readable description string.
 *
 * Produces a compact string with truncated session ID, state transition,
 * and event type, suitable for logging and debugging.
 *
 * @param record - The transition record to describe
 * @returns Formatted string like "[abc12345] idle -> preflight (START)"
 *
 * @example
 * ```typescript
 * const desc = describeTransition(record);
 * // "[abc12345] idle -> preflight (START)"
 * ```
 */
export function describeTransition(record: TransitionRecord): string {
  const shortId = record.session_id.slice(0, 8);
  return `[${shortId}] ${record.previous_state} -> ${record.current_state} (${record.event_type})`;
}
