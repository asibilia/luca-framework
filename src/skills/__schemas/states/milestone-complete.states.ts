/**
 * State machine definition for the milestone-complete orchestrator.
 *
 * Defines 7 states (5 workflow + 1 success terminal + 1 failure terminal) and
 * all transition events for the milestone-complete sub-skill chain. Uses the
 * `createSkillStateMachine` factory from Phase 222.
 *
 * States: idle -> learned -> pruned -> scanned -> archived -> finalized
 *         (plus terminal `failed` from any non-terminal state via ABORT)
 *
 * Conditional paths:
 *   - pruned --SKIP_SCAN--> scanned (shadow debt scanning disabled)
 *   - pruned --SCAN_COMPLETE--> scanned (shadow debt scanning ran)
 *
 * **PREMORTEM Constraint #2:** SKIP_SCAN is an explicit event decided by the
 * orchestrator (fail-closed), not a guard. The orchestrator reads the config
 * to determine whether shadow scanning is enabled and sends the appropriate
 * event.
 *
 * @see .planning/phases/224-anti-skip-rollout/01-PLAN.md Task 1
 * @see src/workflow/__helpers/skill-state-machine.ts
 */
import { z } from "zod";

import { createSkillStateMachine } from "~/workflow/__helpers/skill-state-machine";

import { ABORT_TRANSITION } from "./shared-transitions";

// ─── Context Schema ─────────────────────────────────────────────────────────

/**
 * Context schema for the milestone-complete state machine.
 *
 * Carries minimal state needed for orchestrator decisions:
 * - version: the milestone version string (e.g., "8.5.0")
 * - shadow_debt_enabled: populated from config, read by orchestrator to decide SKIP_SCAN
 */
const MilestoneCompleteMachineContextSchema = z.object({
  version: z.string(),
  shadow_debt_enabled: z.boolean().default(true),
});

// ─── State Machine ──────────────────────────────────────────────────────────

/**
 * milestone-complete state machine definition.
 *
 * Created via `createSkillStateMachine` factory. The returned object is
 * deeply frozen and provides:
 * - `machine`: XState v5 machine definition
 * - `createActor`: typed actor factory with Zod-validated context
 * - `validateContext`: context validator
 *
 * @example
 * ```typescript
 * import { milestoneCompleteStateMachine } from "~/skills/__schemas/states/milestone-complete.states";
 *
 * const actor = milestoneCompleteStateMachine.createActor({
 *   input: { version: "8.5.0", shadow_debt_enabled: true },
 * });
 * actor.start();
 * actor.send({ type: "LEARN_COMPLETE" });
 * ```
 */
export const milestoneCompleteStateMachine = createSkillStateMachine({
  id: "milestone-complete",
  contextSchema: MilestoneCompleteMachineContextSchema,
  initial: "idle",
  states: {
    // ─── Workflow States (5) ─────────────────────────────────────────────

    idle: {
      on: {
        LEARN_COMPLETE: "learned",
        ...ABORT_TRANSITION,
      },
    },

    learned: {
      on: {
        PRUNE_COMPLETE: "pruned",
        ...ABORT_TRANSITION,
      },
    },

    pruned: {
      on: {
        SCAN_COMPLETE: "scanned",
        SKIP_SCAN: "scanned",
        ...ABORT_TRANSITION,
      },
    },

    scanned: {
      on: {
        ARCHIVE_COMPLETE: "archived",
        ...ABORT_TRANSITION,
      },
    },

    archived: {
      on: {
        FINALIZE_COMPLETE: "finalized",
        ...ABORT_TRANSITION,
      },
    },

    // ─── Terminal States ─────────────────────────────────────────────────

    finalized: {
      type: "final" as const,
    },

    failed: {
      type: "final" as const,
    },
  },
});

export type MilestoneCompleteMachineContext = z.infer<
  typeof MilestoneCompleteMachineContextSchema
>;
