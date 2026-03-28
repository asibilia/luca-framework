/**
 * State machine definition for the pr-address orchestrator.
 *
 * Defines 12 states (11 workflow + 1 terminal `failed`) and all transition
 * events for the pr-address sub-skill chain. Uses the `createSkillStateMachine`
 * factory from Phase 222.
 *
 * **PREMORTEM Constraint #2:** SKIP_DEBATE and SKIP_LEARN are explicit events
 * decided by the orchestrator (fail-closed), not guards. The orchestrator sends
 * the appropriate event based on whether split verdicts or learnable comments
 * exist.
 *
 * States: idle -> fetched -> categorized -> validated -> debated -> planned ->
 *         fixed -> verified -> learned -> responded -> pushed
 *         (plus terminal `failed` from any non-terminal state via ABORT)
 *
 * Conditional paths:
 *   - validated --SKIP_DEBATE--> planned (no split verdicts)
 *   - validated --DEBATE_COMPLETE--> debated --PLAN_COMPLETE--> planned
 *   - verified --SKIP_LEARN--> responded (no learnable comments)
 *   - verified --LEARN_COMPLETE--> learned --RESPOND_COMPLETE--> responded
 *
 * @see .planning/phases/223-anti-skip-pilot/01-CONTEXT.md Decision #2
 * @see src/workflow/__helpers/skill-state-machine.ts
 */
import { z } from "zod";

import { createSkillStateMachine } from "~/workflow/__helpers/skill-state-machine";

// ─── Context Schema ─────────────────────────────────────────────────────────

/**
 * Context schema for the pr-address state machine.
 *
 * Carries minimal state needed for orchestrator decisions:
 * - pr_number: which PR is being processed
 * - split_verdicts: populated by pr-validate, read by orchestrator to decide SKIP_DEBATE
 * - valid_concerns: populated by pr-validate, read by orchestrator to decide SKIP_LEARN
 */
const PrAddressMachineContextSchema = z.object({
  pr_number: z.number(),
  split_verdicts: z.array(z.any()).default([]),
  valid_concerns: z.array(z.any()).default([]),
});

// ─── ABORT Transition ───────────────────────────────────────────────────────

/**
 * ABORT transition available from every non-terminal state.
 *
 * The orchestrator sends ABORT when a required sub-skill fails
 * or context validation fails (PREMORTEM Constraint #1).
 */
const ABORT_TRANSITION = { ABORT: "failed" } as const;

// ─── State Machine ──────────────────────────────────────────────────────────

/**
 * pr-address state machine definition.
 *
 * Created via `createSkillStateMachine` factory. The returned object is
 * deeply frozen and provides:
 * - `machine`: XState v5 machine definition
 * - `createActor`: typed actor factory with Zod-validated context
 * - `validateContext`: context validator
 *
 * @example
 * ```typescript
 * import { prAddressStateMachine } from "~/skills/__schemas/states/pr-address.states";
 *
 * const actor = prAddressStateMachine.createActor({
 *   input: { pr_number: 123, split_verdicts: [], valid_concerns: [] },
 * });
 * actor.start();
 * actor.send({ type: "FETCH_COMPLETE" });
 * ```
 */
export const prAddressStateMachine = createSkillStateMachine({
  id: "pr-address",
  contextSchema: PrAddressMachineContextSchema,
  initial: "idle",
  states: {
    // ─── Workflow States (11) ─────────────────────────────────────────────

    idle: {
      on: {
        FETCH_COMPLETE: "fetched",
        ...ABORT_TRANSITION,
      },
    },

    fetched: {
      on: {
        CATEGORIZE_COMPLETE: "categorized",
        ...ABORT_TRANSITION,
      },
    },

    categorized: {
      on: {
        VALIDATE_COMPLETE: "validated",
        ...ABORT_TRANSITION,
      },
    },

    validated: {
      on: {
        SKIP_DEBATE: "planned",
        DEBATE_COMPLETE: "debated",
        ...ABORT_TRANSITION,
      },
    },

    debated: {
      on: {
        PLAN_COMPLETE: "planned",
        ...ABORT_TRANSITION,
      },
    },

    planned: {
      on: {
        FIX_COMPLETE: "fixed",
        ...ABORT_TRANSITION,
      },
    },

    fixed: {
      on: {
        VERIFY_COMPLETE: "verified",
        ...ABORT_TRANSITION,
      },
    },

    verified: {
      on: {
        SKIP_LEARN: "responded",
        LEARN_COMPLETE: "learned",
        ...ABORT_TRANSITION,
      },
    },

    learned: {
      on: {
        RESPOND_COMPLETE: "responded",
        ...ABORT_TRANSITION,
      },
    },

    responded: {
      on: {
        PUSH_COMPLETE: "pushed",
        ...ABORT_TRANSITION,
      },
    },

    pushed: {
      type: "final" as const,
    },

    // ─── Terminal State ─────────────────────────────────────────────────

    failed: {
      type: "final" as const,
    },
  },
});

export type PrAddressMachineContext = z.infer<
  typeof PrAddressMachineContextSchema
>;
