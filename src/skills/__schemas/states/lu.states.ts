/**
 * State machine definition for the lu orchestrator.
 *
 * Defines 8 states (5 workflow + 1 executing + 1 success terminal + 1 failure
 * terminal) and all transition events for the lu sub-agent chain. Uses the
 * `createSkillStateMachine` factory from Phase 222.
 *
 * States: idle -> routed -> configured -> scanned -> executing -> complete
 *         (plus terminal `failed` from any non-terminal state via ABORT)
 *
 * Conditional paths:
 *   - configured --SKIP_BACKLOG--> scanned (--skip-backlog flag passed)
 *   - configured --SCAN_COMPLETE--> scanned (backlog scan completed)
 *
 * **Note:** SKIP_COGNITION is handled within lu-route internally (not a state
 * machine event). The orchestrator does not need to model it.
 *
 * **PREMORTEM Constraint #2:** SKIP_BACKLOG is an explicit event decided by the
 * orchestrator (fail-closed), not a guard. The orchestrator reads the
 * --skip-backlog flag and sends the appropriate event.
 *
 * @see .planning/phases/224-anti-skip-rollout/04-PLAN.md Task 1
 * @see src/workflow/__helpers/skill-state-machine.ts
 */
import { z } from "zod";

import { createSkillStateMachine } from "~/workflow";

import { ABORT_TRANSITION } from "./shared-transitions";

// ─── Context Schema ─────────────────────────────────────────────────────────

/**
 * Context schema for the lu state machine.
 *
 * Carries minimal state needed for orchestrator decisions:
 * - complexity_level: classified complexity (e.g., "MODERATE")
 * - phase_number: current phase being executed
 * - skip_backlog: whether --skip-backlog flag was passed
 * - skip_memory: whether --skip-memory flag was passed
 */
const LuMachineContextSchema = z.object({
  complexity_level: z.string().default("MODERATE"),
  phase_number: z.number().default(0),
  skip_backlog: z.boolean().default(false),
  skip_memory: z.boolean().default(false),
});

// ─── State Machine ──────────────────────────────────────────────────────────

/**
 * lu state machine definition.
 *
 * Created via `createSkillStateMachine` factory. The returned object is
 * deeply frozen and provides:
 * - `machine`: XState v5 machine definition
 * - `createActor`: typed actor factory with Zod-validated context
 * - `validateContext`: context validator
 *
 * @example
 * ```typescript
 * import { luStateMachine } from "~/skills/__schemas/states/lu.states";
 *
 * const actor = luStateMachine.createActor({
 *   input: { complexity_level: "MODERATE", phase_number: 0, skip_backlog: false, skip_memory: false },
 * });
 * actor.start();
 * actor.send({ type: "ROUTE_COMPLETE" });
 * ```
 */
export const luStateMachine = createSkillStateMachine({
  id: "lu",
  contextSchema: LuMachineContextSchema,
  initial: "idle",
  states: {
    // ─── Workflow States (5) ─────────────────────────────────────────────

    idle: {
      on: {
        ROUTE_COMPLETE: "routed",
        ...ABORT_TRANSITION,
      },
    },

    routed: {
      on: {
        CONFIGURE_COMPLETE: "configured",
        ...ABORT_TRANSITION,
      },
    },

    configured: {
      on: {
        SCAN_COMPLETE: "scanned",
        SKIP_BACKLOG: "scanned",
        ...ABORT_TRANSITION,
      },
    },

    scanned: {
      on: {
        EXECUTE_START: "executing",
        ...ABORT_TRANSITION,
      },
    },

    executing: {
      on: {
        EXECUTE_COMPLETE: "complete",
        ...ABORT_TRANSITION,
      },
    },

    // ─── Terminal States ─────────────────────────────────────────────────

    complete: {
      type: "final" as const,
    },

    failed: {
      type: "final" as const,
    },
  },
});

export type LuMachineContext = z.infer<typeof LuMachineContextSchema>;
