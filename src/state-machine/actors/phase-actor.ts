/**
 * Phase actor child machine for phase lifecycle management.
 *
 * Models the execution lifecycle of a single phase: wave execution,
 * harness verification, and fix iterations. Invoked as a child actor
 * by the parent workflow machine during the "executing" state.
 *
 * States:
 * - idle: Waiting for PLAN_WAVE to start wave execution
 * - wave_executing: A wave of plans is being executed
 * - wave_evaluating: Evaluating wave result, deciding next step
 * - phase_verifying: Running harness verification after all waves
 * - phase_fixing: Fixing harness failures within the fix budget
 * - phase_done: Terminal success state (outcome = "passed")
 * - phase_blocked: Terminal failure state (outcome = "blocked")
 *
 * @module state-machine/actors/phase-actor
 */
import { setup, assign } from "xstate";
import type { PhaseContext, PhaseEvent, PhaseInput } from "../types";

// ─── Machine Definition ──────────────────────────────────────────────────────

export const phaseActorMachine = setup({
  types: {
    context: {} as PhaseContext,
    events: {} as PhaseEvent,
    input: {} as PhaseInput,
    output: {} as { phase_id: number; outcome: string; outcome_reason: string },
  },
  guards: {
    /**
     * Check if there are more waves to execute.
     *
     * @returns true if current_wave < total_waves
     */
    hasMoreWaves: ({ context }) => {
      return context.current_wave < context.total_waves;
    },

    /**
     * Check if the fix iteration budget has not been exhausted.
     *
     * @returns true if fix_iterations < max_fix_iterations
     */
    withinFixBudget: ({ context }) => {
      return context.fix_iterations < context.max_fix_iterations;
    },
  },
  actions: {
    /** Record the start timestamp of the phase */
    recordStart: assign({
      timestamps: ({ context }) => ({
        ...context.timestamps,
        started_at: new Date().toISOString(),
      }),
    }),

    /** Increment the wave counter */
    advanceWave: assign({
      current_wave: ({ context }) => context.current_wave + 1,
    }),

    /** Record a successful wave completion */
    recordWaveComplete: assign({
      wave_results: ({ context, event }) => {
        if (event.type !== "WAVE_COMPLETE") return context.wave_results;
        return [
          ...context.wave_results,
          {
            wave_number: event.wave_number,
            plan_ids: context.plan_ids,
            status: "passed" as const,
            summary: event.summary ?? "",
            timestamp: new Date().toISOString(),
          },
        ];
      },
    }),

    /** Record a failed wave */
    recordWaveFailed: assign({
      wave_results: ({ context, event }) => {
        if (event.type !== "WAVE_FAILED") return context.wave_results;
        return [
          ...context.wave_results,
          {
            wave_number: event.wave_number,
            plan_ids: context.plan_ids,
            status: "failed" as const,
            summary: event.error ?? "",
            timestamp: new Date().toISOString(),
          },
        ];
      },
    }),

    /** Mark the harness as passed */
    markHarnessPassed: assign({
      harness_passed: () => true,
    }),

    /** Record a harness failure with error details */
    recordHarnessFailed: assign({
      last_harness_errors: ({ event }) => {
        if (event.type !== "HARNESS_FAILED") return [];
        return [`${event.error_count} error(s) detected`];
      },
    }),

    /** Increment the fix iteration counter */
    incrementFixIterations: assign({
      fix_iterations: ({ context }) => context.fix_iterations + 1,
    }),

    /** Mark the phase outcome as passed */
    markPassed: assign({
      outcome: () => "passed" as const,
      outcome_reason: () => "All waves completed and harness passed",
      timestamps: ({ context }) => ({
        ...context.timestamps,
        completed_at: new Date().toISOString(),
      }),
    }),

    /** Mark the phase outcome as blocked */
    markBlocked: assign({
      outcome: () => "blocked" as const,
      outcome_reason: ({ context, event }) => {
        if (event.type === "FIX_FAILED") {
          return `Fix failed: ${event.error}`;
        }
        if (event.type === "HARNESS_FAILED") {
          return `Fix budget exhausted after ${context.fix_iterations} iterations`;
        }
        return "Phase blocked";
      },
      timestamps: ({ context }) => ({
        ...context.timestamps,
        completed_at: new Date().toISOString(),
      }),
    }),
  },
}).createMachine({
  id: "phase-actor",
  initial: "idle",
  context: ({ input }) => ({
    phase_id: input.phase_id,
    plan_ids: input.plan_ids ?? [],
    current_wave: 0,
    total_waves: input.total_waves ?? 1,
    wave_results: [],
    fix_iterations: 0,
    max_fix_iterations: input.max_fix_iterations ?? 3,
    harness_passed: false,
    last_harness_errors: [],
    outcome: "pending" as const,
    outcome_reason: "",
    timestamps: {
      started_at: undefined,
      completed_at: undefined,
    },
  }),

  states: {
    idle: {
      on: {
        PLAN_WAVE: {
          target: "wave_executing",
          actions: ["recordStart", "advanceWave"],
        },
      },
    },

    wave_executing: {
      on: {
        WAVE_COMPLETE: {
          target: "wave_evaluating",
          actions: ["recordWaveComplete"],
        },
        WAVE_FAILED: {
          target: "wave_evaluating",
          actions: ["recordWaveFailed"],
        },
      },
    },

    wave_evaluating: {
      always: [
        {
          target: "wave_executing",
          guard: "hasMoreWaves",
          actions: ["advanceWave"],
        },
        {
          target: "phase_verifying",
        },
      ],
    },

    phase_verifying: {
      on: {
        HARNESS_PASSED: {
          target: "phase_done",
          actions: ["markHarnessPassed", "markPassed"],
        },
        HARNESS_FAILED: [
          {
            target: "phase_fixing",
            guard: "withinFixBudget",
            actions: ["recordHarnessFailed", "incrementFixIterations"],
          },
          {
            target: "phase_blocked",
            actions: ["recordHarnessFailed", "markBlocked"],
          },
        ],
      },
    },

    phase_fixing: {
      on: {
        FIX_COMPLETE: {
          target: "phase_verifying",
        },
        FIX_FAILED: {
          target: "phase_blocked",
          actions: ["markBlocked"],
        },
      },
    },

    phase_done: {
      type: "final",
      output: ({ context }) => ({
        phase_id: context.phase_id,
        outcome: context.outcome,
        outcome_reason: context.outcome_reason,
      }),
    },

    phase_blocked: {
      type: "final",
      output: ({ context }) => ({
        phase_id: context.phase_id,
        outcome: context.outcome,
        outcome_reason: context.outcome_reason,
      }),
    },
  },

  output: ({ context }) => ({
    phase_id: context.phase_id,
    outcome: context.outcome,
    outcome_reason: context.outcome_reason,
  }),
});
