/**
 * Action definitions for the Luca workflow state machine.
 *
 * Actions are defined inline in the `setup()` call in machine.ts
 * using XState's `assign()` for type-safe context mutations.
 * This module re-exports action metadata for documentation and testing.
 *
 * Every action records `last_transition_at` to maintain an audit trail
 * of when the most recent state transition occurred.
 *
 * Action list:
 * - recordTransition: Timestamp the current transition
 * - initSession: Set ticket_id and started_at from START event
 * - recordIntuitionFlags: Store intuition flags from preflight
 * - setComplexity: Set complexity level from routing
 * - recordPhaseResult: Record phase completion result
 * - recordPhaseError: Record phase failure
 * - resetVerificationAttempts: Reset verification counter for new cycle
 * - incrementVerificationAttempts: Increment verification attempt counter
 * - recordSkip: Record skip reason
 * - recordAbort: Record abort reason and clear current phase
 * - resetContext: Reset machine context for a new session
 * - recordHalt: Record halt reason for paused state
 * - recordVerificationGaps: Record verification failure gaps
 * - recordPhaseActorDone: Handle onDone output from phase child actor
 */

/** All action names for documentation and testing */
export const actionNames = [
  "recordTransition",
  "initSession",
  "recordIntuitionFlags",
  "setComplexity",
  "recordPhaseResult",
  "recordPhaseError",
  "resetVerificationAttempts",
  "incrementVerificationAttempts",
  "recordSkip",
  "recordAbort",
  "resetContext",
  "recordHalt",
  "recordVerificationGaps",
  "recordPhaseActorDone",
] as const;

export type ActionName = (typeof actionNames)[number];
