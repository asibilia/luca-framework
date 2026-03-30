/**
 * State machine definition for the verify orchestrator.
 *
 * Defines 7 states (4 workflow + 2 success terminals + 1 failure terminal) and
 * all transition events for the verify sub-agent chain. Uses the
 * `createSkillStateMachine` factory from Phase 222.
 *
 * The verify skill has TWO divergent terminal paths:
 *   - Path A (no UAT issues): idle -> extracted -> tested -> reviewed (terminal)
 *   - Path B (UAT issues found): idle -> extracted -> tested -> diagnosed (terminal)
 *
 * States: idle -> extracted -> tested -> reviewed OR diagnosed
 *         (plus terminal `failed` from any non-terminal state via ABORT)
 *
 * Conditional paths:
 *   - tested --SKIP_DIAGNOSE--> reviewed (UAT passed, skip to code review)
 *   - tested --DIAGNOSE_COMPLETE--> diagnosed (UAT failed, diagnose issues)
 *   - diagnosed: terminal (fixes planned, next run is --gaps-only)
 *   - reviewed: terminal (phase verified, all clean)
 *
 * **PREMORTEM Constraint #2:** SKIP_DIAGNOSE is an explicit event decided by
 * the orchestrator (fail-closed), not a guard. The orchestrator reads
 * `issues_found` from the context file and sends the appropriate event.
 *
 * @see .planning/phases/224-anti-skip-rollout/02-PLAN.md Task 1
 * @see src/workflow/__helpers/skill-state-machine.ts
 */
import { z } from "zod";

import { createSkillStateMachine } from "~/workflow/__helpers/skill-state-machine";

import { ABORT_TRANSITION } from "./shared-transitions";

// ─── Context Schema ─────────────────────────────────────────────────────────

/**
 * Context schema for the verify state machine.
 *
 * Carries minimal state needed for orchestrator decisions:
 * - phase_number: which phase is being verified
 * - issues_found: populated by verify-test, read by orchestrator to decide
 *   SKIP_DIAGNOSE vs DIAGNOSE_COMPLETE
 * - gap_mode: whether this is a --gaps-only re-run
 */
const VerifyMachineContextSchema = z.object({
  phase_number: z.number(),
  issues_found: z.boolean().default(false),
  gap_mode: z.boolean().default(false),
});

// ─── State Machine ──────────────────────────────────────────────────────────

/**
 * verify state machine definition.
 *
 * Created via `createSkillStateMachine` factory. The returned object is
 * deeply frozen and provides:
 * - `machine`: XState v5 machine definition
 * - `createActor`: typed actor factory with Zod-validated context
 * - `validateContext`: context validator
 *
 * @example
 * ```typescript
 * import { verifyStateMachine } from "~/skills/__schemas/states/verify.states";
 *
 * const actor = verifyStateMachine.createActor({
 *   input: { phase_number: 99, issues_found: false, gap_mode: false },
 * });
 * actor.start();
 * actor.send({ type: "EXTRACT_COMPLETE" });
 * ```
 */
export const verifyStateMachine = createSkillStateMachine({
  id: "verify",
  contextSchema: VerifyMachineContextSchema,
  initial: "idle",
  states: {
    // ─── Workflow States (3) ─────────────────────────────────────────────

    idle: {
      on: {
        EXTRACT_COMPLETE: "extracted",
        ...ABORT_TRANSITION,
      },
    },

    extracted: {
      on: {
        TEST_COMPLETE: "tested",
        ...ABORT_TRANSITION,
      },
    },

    tested: {
      on: {
        SKIP_DIAGNOSE: "reviewed",
        DIAGNOSE_COMPLETE: "diagnosed",
        ...ABORT_TRANSITION,
      },
    },

    // ─── Terminal States (3) ─────────────────────────────────────────────

    /**
     * Terminal state for Path B: UAT issues were found.
     * Debuggers diagnosed root causes and fix plans were created.
     * The next step is `/phase-execute --gaps-only`.
     */
    diagnosed: {
      type: "final" as const,
    },

    /**
     * Terminal state for Path A: UAT passed, code review completed.
     * The phase is fully verified.
     */
    reviewed: {
      type: "final" as const,
    },

    failed: {
      type: "final" as const,
    },
  },
});

export type VerifyMachineContext = z.infer<typeof VerifyMachineContextSchema>;
