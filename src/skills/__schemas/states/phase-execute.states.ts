/**
 * State machine definition for the phase-execute orchestrator.
 *
 * Defines 8 states (6 workflow + 2 terminal) and all transition events for the
 * phase-execute sub-agent chain. Uses the `createSkillStateMachine` factory
 * from Phase 222.
 *
 * **CRITICAL (Pitfall 6):** phase-execute already uses `luca-bridge transition`
 * with events VERIFY_PASSED, LEARN_COMPLETE, PROCESS_DATA_COMPLETE,
 * COMMIT_COMPLETE. This state machine EXTENDS those existing transitions by
 * reusing LEARN_COMPLETE and COMMIT_COMPLETE as event names in the machine.
 * The orchestrator continues to emit bridge events alongside context file
 * state tracking.
 *
 * States: idle -> setup -> executed -> verified -> reviewed -> learned -> committed
 *         (plus terminal `failed` from any non-terminal state via ABORT)
 *
 * Sub-skill boundaries:
 *   - Setup (Steps 0-0.6): orchestrator handles internally, transitions to "setup"
 *   - phase-execute-waves (Steps 1-4): wave discovery/grouping/execution
 *   - phase-execute-verify (Steps 5-7): harness + verify fix loops
 *   - phase-execute-review (Step 8): code review swarm
 *   - Learning capture (Step 9+): orchestrator handles, transitions to "learned"
 *   - Final commit: orchestrator handles, transitions to "committed"
 *
 * Conditional paths:
 *   - verified --SKIP_REVIEW--> reviewed (verification failed or code_review disabled)
 *   - verified --REVIEW_COMPLETE--> reviewed (code review completed)
 *
 * Bridge event alignment:
 *   - LEARN_COMPLETE: reused from existing bridge transition (maps to reviewed -> learned)
 *   - COMMIT_COMPLETE: reused from existing bridge transition (maps to learned -> committed)
 *
 * @see .planning/phases/224-anti-skip-rollout/03-PLAN.md Task 1
 * @see src/workflow/__helpers/skill-state-machine.ts
 */
import { z } from "zod";

import { createSkillStateMachine } from "~/workflow/__helpers/skill-state-machine";

import { ABORT_TRANSITION } from "./shared-transitions";

// ─── Context Schema ─────────────────────────────────────────────────────────

/**
 * Context schema for the phase-execute state machine.
 *
 * Carries minimal state needed for orchestrator decisions:
 * - phase_number: which phase is being executed
 * - plan_count: number of plans discovered in the phase
 * - wave_count: number of waves grouped from plans
 * - gaps_only: whether running in --gaps-only mode
 * - harness_passed: populated by phase-execute-verify, read by orchestrator
 *   to decide SKIP_REVIEW vs REVIEW_COMPLETE
 */
const PhaseExecuteMachineContextSchema = z.object({
  phase_number: z.number(),
  plan_count: z.number().default(0),
  wave_count: z.number().default(0),
  gaps_only: z.boolean().default(false),
  harness_passed: z.boolean().default(false),
});

// ─── State Machine ──────────────────────────────────────────────────────────

/**
 * phase-execute state machine definition.
 *
 * Created via `createSkillStateMachine` factory. The returned object is
 * deeply frozen and provides:
 * - `machine`: XState v5 machine definition
 * - `createActor`: typed actor factory with Zod-validated context
 * - `validateContext`: context validator
 *
 * @example
 * ```typescript
 * import { phaseExecuteStateMachine } from "~/skills/__schemas/states/phase-execute.states";
 *
 * const actor = phaseExecuteStateMachine.createActor({
 *   input: { phase_number: 99, plan_count: 0, wave_count: 0, gaps_only: false, harness_passed: false },
 * });
 * actor.start();
 * actor.send({ type: "SETUP_COMPLETE" });
 * ```
 */
export const phaseExecuteStateMachine = createSkillStateMachine({
  id: "phase-execute",
  contextSchema: PhaseExecuteMachineContextSchema,
  initial: "idle",
  states: {
    // ─── Workflow States (6) ─────────────────────────────────────────────

    idle: {
      on: {
        SETUP_COMPLETE: "setup",
        ...ABORT_TRANSITION,
      },
    },

    setup: {
      on: {
        WAVES_COMPLETE: "executed",
        ...ABORT_TRANSITION,
      },
    },

    executed: {
      on: {
        VERIFY_COMPLETE: "verified",
        ...ABORT_TRANSITION,
      },
    },

    verified: {
      on: {
        REVIEW_COMPLETE: "reviewed",
        SKIP_REVIEW: "reviewed",
        ...ABORT_TRANSITION,
      },
    },

    reviewed: {
      on: {
        LEARN_COMPLETE: "learned",
        ...ABORT_TRANSITION,
      },
    },

    learned: {
      on: {
        COMMIT_COMPLETE: "committed",
        ...ABORT_TRANSITION,
      },
    },

    // ─── Terminal States ─────────────────────────────────────────────────

    committed: {
      type: "final" as const,
    },

    failed: {
      type: "final" as const,
    },
  },
});

export type PhaseExecuteMachineContext = z.infer<
  typeof PhaseExecuteMachineContextSchema
>;
