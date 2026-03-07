/**
 * The Luca workflow state machine.
 *
 * Models the full workflow lifecycle from idle through execution,
 * verification, learning, and commit. Guards encode complexity
 * gating and gate config. Actions mutate context immutably.
 *
 * States:
 * - idle: Waiting for a START event
 * - preflight: Cognitive pre-flight (MuninnDB recall)
 * - routing: Complexity classification via lu-router
 * - discussing: Phase discussion (optional, gated by complexity)
 * - planning: Plan creation and verification
 * - executing: Phase execution (plan waves)
 * - verifying: Harness + verifier checks
 * - learning: Pattern/decision/pitfall capture
 * - committing: Git commit
 * - complete: Terminal success state
 * - paused: Waiting for human intervention
 * - failed: Terminal error state
 */
import { setup, assign, createActor } from "xstate";
import get from "lodash/get";

import type { WorkflowContext, WorkflowEvent } from "./types";
import { initializeContext } from "./types";
import { workflowGuards } from "./guards";
import { phaseActorMachine } from "./actors/phase-actor";

// ─── Phase Actor Output Type ────────────────────────────────────────────────

/**
 * Output shape from the phase actor child machine.
 *
 * Matches the `output` defined in `phaseActorMachine.setup({ types: { output } })`.
 * Used to type the `onDone` event in the parent workflow machine.
 */
interface PhaseActorOutput {
  phase_id: number;
  outcome: string;
  outcome_reason: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Look up max fix iterations from the complexity matrix for the current level.
 *
 * Falls back to 3 if not found in the matrix.
 *
 * @param context - The workflow context containing complexity and complexity_matrix
 * @returns The maximum number of fix iterations for the current complexity level
 */
function getMaxFixIterations(context: WorkflowContext): number {
  return (
    (get(
      context.complexity_matrix,
      `${context.complexity}.harnessFixIterations`,
    ) as number | undefined) ?? 3
  );
}

// ─── Machine Input Type ──────────────────────────────────────────────────────

/** Input type for creating a workflow machine actor */
export type WorkflowMachineInput = Partial<WorkflowContext> & {
  config?: Record<string, unknown>;
};

// ─── Machine Definition ──────────────────────────────────────────────────────

/** Default idle timeout in milliseconds (5 minutes) */
const DEFAULT_IDLE_TIMEOUT_MS = 300_000;

export const workflowMachine = setup({
  types: {
    context: {} as WorkflowContext,
    events: {} as WorkflowEvent,
    input: {} as WorkflowMachineInput | undefined,
  },
  actors: {
    phaseActor: phaseActorMachine,
  },
  guards: workflowGuards,
  delays: {
    /** Dynamic idle timeout — reads from config or uses 5-minute default */
    idleTimeout: ({ context }) => {
      const configMs = get(context, "workflow_config.idle_timeout_ms");
      return typeof configMs === "number" && configMs > 0
        ? configMs
        : DEFAULT_IDLE_TIMEOUT_MS;
    },
  },
  actions: {
    /** Record the timestamp of the current transition */
    recordTransition: assign({
      last_transition_at: () => new Date().toISOString(),
    }),

    /** Set ticket_id and started_at from START event */
    initSession: assign({
      ticket_id: ({ event }) => {
        if (event.type === "START") return event.ticket_id;
        return undefined;
      },
      started_at: () => new Date().toISOString(),
    }),

    /** Store intuition flags from preflight */
    recordIntuitionFlags: assign({
      intuition_flags: ({ event }) => {
        if (event.type === "PREFLIGHT_COMPLETE") return event.intuition_flags;
        return [];
      },
    }),

    /** Set complexity level from routing */
    setComplexity: assign({
      complexity: ({ event }) => {
        if (event.type === "ROUTE_COMPLETE") return event.complexity;
        return "TRIVIAL" as const;
      },
    }),

    /** Record phase completion result */
    recordPhaseResult: assign({
      phase_results: ({ context, event }) => {
        if (event.type === "PHASE_COMPLETE") {
          return [
            ...context.phase_results,
            {
              phase_id: event.phase_id,
              status: "passed" as const,
              summary: event.summary ?? "",
              errors: [] as string[],
              duration_ms: 0,
              timestamp: new Date().toISOString(),
            },
          ];
        }
        return context.phase_results;
      },
    }),

    /** Record phase failure */
    recordPhaseError: assign({
      phase_results: ({ context, event }) => {
        if (event.type === "PHASE_FAILED") {
          return [
            ...context.phase_results,
            {
              phase_id: event.phase_id,
              status: "failed" as const,
              summary: "",
              errors: [event.error ?? "Unknown error"],
              duration_ms: 0,
              timestamp: new Date().toISOString(),
            },
          ];
        }
        return context.phase_results;
      },
      last_error: ({ event }) => {
        if (event.type === "PHASE_FAILED") return event.error;
        return undefined;
      },
    }),

    /** Reset verification attempts counter for a new verification cycle */
    resetVerificationAttempts: assign({
      verification_attempts: () => 0,
      harness_result: () => undefined,
    }),

    /** Increment verification attempt counter */
    incrementVerificationAttempts: assign({
      verification_attempts: ({ context }) => context.verification_attempts + 1,
    }),

    /** Record skip reason */
    recordSkip: assign({
      skip_reason: ({ event }) => {
        if (event.type === "SKIP") return event.reason;
        return undefined;
      },
    }),

    /** Record abort reason and clear current phase */
    recordAbort: assign({
      last_error: ({ event }) => {
        if (event.type === "ABORT") return event.reason;
        return undefined;
      },
      current_phase: () => undefined,
    }),

    /** Reset machine context for a new session */
    resetContext: assign({
      current_phase: () => undefined,
      current_plan_ids: () => [] as string[],
      phase_results: () => [] as WorkflowContext["phase_results"],
      harness_result: () => undefined,
      verification_attempts: () => 0,
      iteration_budget: () => undefined,
      intuition_flags: () => [] as string[],
      skip_reason: () => undefined,
      last_error: () => undefined,
    }),

    /** Record halt reason for paused state */
    recordHalt: assign({
      last_error: ({ event }) => {
        if (event.type === "VERIFY_HALTED") return event.reason;
        return undefined;
      },
    }),

    /** Record suspend metadata when entering suspended state */
    recordSuspend: assign({
      suspend_metadata: ({ event }) => {
        if (event.type === "SUSPEND") {
          return {
            suspended_at: new Date().toISOString(),
            reason: event.reason,
            checkpoint_path: event.checkpoint_id
              ? `.planning/checkpoints/suspend-${event.checkpoint_id}.json`
              : undefined,
          };
        }
        return undefined;
      },
    }),

    /** Clear suspend metadata when resuming from suspended state */
    clearSuspendMetadata: assign({
      suspend_metadata: () => undefined,
    }),

    /** Record verification failure gaps */
    recordVerificationGaps: assign({
      last_error: ({ event }) => {
        if (event.type === "VERIFY_FAILED")
          return `Verification gaps: ${event.gaps.join(", ")}`;
        return undefined;
      },
    }),

    /** Handle onDone output from the phase child actor */
    recordPhaseActorDone: assign({
      phase_results: ({ context, event }) => {
        // Cast event to access phase actor output — XState's DoneActorEvent
        // carries `output` but the generic AssignArgs type doesn't expose it.
        const output = (event as unknown as { output?: PhaseActorOutput })
          .output;
        return [
          ...context.phase_results,
          {
            phase_id: output?.phase_id ?? context.current_phase ?? 0,
            status:
              output?.outcome === "passed"
                ? ("passed" as const)
                : output?.outcome === "blocked"
                  ? ("blocked" as const)
                  : ("failed" as const),
            summary: output?.outcome_reason ?? "",
            errors:
              output?.outcome === "blocked" ? [output.outcome_reason] : [],
            duration_ms: 0,
            timestamp: new Date().toISOString(),
          },
        ];
      },
    }),
  },
}).createMachine({
  id: "luca-workflow",
  initial: "idle",
  context: ({ input }) => initializeContext(input ?? undefined),

  states: {
    idle: {
      after: {
        idleTimeout: {
          target: "failed",
          actions: ["recordTransition"],
        },
      },
      on: {
        START: {
          target: "preflight",
          actions: ["initSession", "recordTransition"],
        },
      },
    },

    preflight: {
      on: {
        PREFLIGHT_COMPLETE: {
          target: "routing",
          actions: ["recordIntuitionFlags", "recordTransition"],
        },
        SKIP: {
          target: "routing",
          actions: ["recordSkip", "recordTransition"],
        },
      },
    },

    routing: {
      on: {
        ROUTE_COMPLETE: [
          {
            target: "discussing",
            guard: "shouldRunDiscussion",
            actions: ["setComplexity", "recordTransition"],
          },
          {
            target: "planning",
            actions: ["setComplexity", "recordTransition"],
          },
        ],
      },
    },

    discussing: {
      on: {
        DISCUSS_COMPLETE: {
          target: "planning",
          actions: "recordTransition",
        },
        SKIP: {
          target: "planning",
          actions: ["recordSkip", "recordTransition"],
        },
      },
    },

    planning: {
      on: {
        PLAN_COMPLETE: {
          target: "executing",
          actions: ["resetVerificationAttempts", "recordTransition"],
        },
      },
    },

    executing: {
      invoke: {
        id: "phase",
        src: "phaseActor",
        input: ({ context }: { context: WorkflowContext }) => ({
          phase_id: context.current_phase ?? 0,
          plan_ids: context.current_plan_ids,
          total_waves: context.current_wave_count || 1,
          max_fix_iterations: getMaxFixIterations(context),
        }),
        onDone: {
          target: "verifying",
          actions: [
            "recordPhaseActorDone",
            "resetVerificationAttempts",
            "recordTransition",
          ],
        },
        onError: {
          target: "paused",
          actions: ["recordPhaseError", "recordTransition"],
        },
      },
      on: {
        PHASE_COMPLETE: {
          target: "verifying",
          actions: ["recordPhaseResult", "recordTransition"],
        },
        PHASE_FAILED: {
          target: "verifying",
          actions: ["recordPhaseError", "recordTransition"],
        },
        SUSPEND: {
          target: "suspended",
          actions: ["recordSuspend", "recordTransition"],
        },
      },
    },

    verifying: {
      on: {
        VERIFY_PASSED: [
          {
            target: "learning",
            guard: "shouldCaptureLearnings",
            actions: "recordTransition",
          },
          {
            target: "committing",
            actions: "recordTransition",
          },
        ],
        VERIFY_FAILED: [
          {
            target: "executing",
            guard: "canRetryVerification",
            actions: [
              "incrementVerificationAttempts",
              "recordVerificationGaps",
              "recordTransition",
            ],
          },
          {
            target: "failed",
            actions: ["recordVerificationGaps", "recordTransition"],
          },
        ],
        VERIFY_HALTED: {
          target: "paused",
          actions: ["recordHalt", "recordTransition"],
        },
      },
    },

    learning: {
      on: {
        LEARN_COMPLETE: {
          target: "committing",
          actions: "recordTransition",
        },
        SKIP: {
          target: "committing",
          actions: ["recordSkip", "recordTransition"],
        },
      },
    },

    committing: {
      on: {
        COMMIT_COMPLETE: [
          {
            target: "idle",
            guard: "hasMorePhases",
            actions: ["resetContext", "recordTransition"],
          },
          {
            target: "complete",
            actions: "recordTransition",
          },
        ],
      },
    },

    complete: {
      type: "final",
    },

    paused: {
      after: {
        idleTimeout: {
          target: "failed",
          actions: ["recordTransition"],
        },
      },
      on: {
        RESUME: {
          target: "executing",
          actions: "recordTransition",
        },
        ABORT: {
          target: "idle",
          actions: ["recordAbort", "recordTransition"],
        },
      },
    },

    suspended: {
      after: {
        idleTimeout: {
          target: "failed",
          actions: ["recordTransition"],
        },
      },
      on: {
        RESUME_PHASE: {
          target: "executing",
          actions: ["clearSuspendMetadata", "recordTransition"],
        },
        ABORT: {
          target: "idle",
          actions: ["recordAbort", "clearSuspendMetadata", "recordTransition"],
        },
        RESET: {
          target: "idle",
          actions: ["resetContext", "clearSuspendMetadata", "recordTransition"],
        },
      },
    },

    failed: {
      on: {
        RESET: {
          target: "idle",
          actions: ["resetContext", "recordTransition"],
        },
      },
    },
  },
});

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Get the list of event types that are valid in the current state.
 *
 * Useful for CLI `status` command and LLM prompt construction.
 *
 * @param snapshot - The current machine snapshot
 * @returns Array of event type strings that the machine will accept
 */
export function getAllowedEvents(
  snapshot: ReturnType<
    ReturnType<typeof createActor<typeof workflowMachine>>["getSnapshot"]
  >,
): string[] {
  const state = snapshot.value as string;
  const stateConfig = workflowMachine.config.states?.[state];
  if (!stateConfig || !stateConfig.on) return [];
  return Object.keys(stateConfig.on);
}
