/**
 * Shared transition constants for orchestrator state machines.
 *
 * Centralizes transition objects that are identical across all orchestrator
 * state machines (lu, phase-execute, verify, milestone-complete, pr-address).
 * Import from here instead of redefining in each state file.
 *
 * @module shared-transitions
 * @see src/skills/__schemas/states/lu.states.ts
 * @see src/skills/__schemas/states/phase-execute.states.ts
 * @see src/skills/__schemas/states/verify.states.ts
 * @see src/skills/__schemas/states/milestone-complete.states.ts
 * @see src/skills/__schemas/states/pr-address.states.ts
 */

// ─── ABORT Transition ───────────────────────────────────────────────────────

/**
 * ABORT transition available from every non-terminal state.
 *
 * Maps the `ABORT` event to the `"failed"` terminal state. This constant is
 * consumed by all orchestrator state machines and is spread into each
 * non-terminal state's `on` map:
 *
 * ```typescript
 * idle: {
 *   on: {
 *     SOME_EVENT: "next_state",
 *     ...ABORT_TRANSITION,
 *   },
 * },
 * ```
 *
 * The orchestrator sends ABORT when a required sub-skill fails or when
 * context validation fails (PREMORTEM Constraint #1).
 *
 * @example
 * ```typescript
 * import { ABORT_TRANSITION } from "./shared-transitions";
 *
 * const states = {
 *   idle: {
 *     on: {
 *       START: "running",
 *       ...ABORT_TRANSITION,
 *     },
 *   },
 *   running: {
 *     on: {
 *       COMPLETE: "done",
 *       ...ABORT_TRANSITION,
 *     },
 *   },
 *   done: { type: "final" as const },
 *   failed: { type: "final" as const },
 * };
 * ```
 */
export const ABORT_TRANSITION = { ABORT: "failed" } as const;
