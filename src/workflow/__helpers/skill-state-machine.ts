/**
 * Factory for creating per-skill XState v5 state machines.
 *
 * Wraps the XState `setup()` API in a functional factory that accepts
 * caller-supplied Zod schemas for context validation. Returns an
 * immutable object with the machine definition, a typed actor creator,
 * and a context validator.
 *
 * Follows the `buildPhaseDAG` factory pattern in dag-builder.ts:
 * functional closure, no classes, deep-frozen return value.
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { createSkillStateMachine } from "~/workflow";
 *
 * const ContextSchema = z.object({
 *   complexity: z.string(),
 *   phaseId: z.number(),
 * });
 *
 * const sm = createSkillStateMachine({
 *   id: "lu-router",
 *   contextSchema: ContextSchema,
 *   initial: "idle",
 *   states: {
 *     idle: { on: { START: "running" } },
 *     running: { on: { DONE: "complete" } },
 *     complete: { type: "final" },
 *   },
 * });
 *
 * const valid = sm.validateContext({ complexity: "MODERATE", phaseId: 1 });
 * const actor = sm.createActor({ input: { complexity: "MODERATE", phaseId: 1 } });
 * actor.start();
 * ```
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md
 */

import { setup, createActor as xstateCreateActor } from "xstate";

import type { z } from "zod";
import type { AnyEventObject, AnyStateMachine, MachineContext } from "xstate";

import { deepFreeze } from "~/shared/__helpers/deep-freeze";

// ─── Config Types ────────────────────────────────────────────────────────────

/**
 * Configuration for creating a skill state machine.
 *
 * @param TContext - The context type (inferred from contextSchema)
 */
export interface SkillMachineConfig<TContext extends MachineContext> {
  /** Unique machine identifier (typically the skill name). */
  id: string;

  /**
   * Zod schema that defines and validates the machine context.
   *
   * Used at machine creation time to validate initial context, and
   * exposed via `validateContext()` for callers to pre-validate.
   */
  contextSchema: z.ZodType<TContext>;

  /**
   * Initial state node name.
   *
   * Must match one of the keys in `states`.
   */
  initial: string;

  /**
   * State node definitions.
   *
   * Follows XState v5 state config format: each key is a state name,
   * each value defines transitions (`on`), entry/exit actions, and
   * optional `type: "final"` for terminal states.
   */
  states: Record<string, unknown>;

  /**
   * Named actions for the machine.
   *
   * Maps action names (referenced in state configs via `actions: "name"`)
   * to action implementations.
   */
  actions?: Record<string, (...args: unknown[]) => void>;

  /**
   * Named guards for the machine.
   *
   * Maps guard names (referenced in state configs via `guard: "name"`)
   * to guard predicate implementations.
   */
  guards?: Record<string, (...args: unknown[]) => boolean>;
}

// ─── Return Type ─────────────────────────────────────────────────────────────

/**
 * Return value from `createSkillStateMachine`.
 *
 * Deeply frozen to prevent mutation after construction.
 *
 * @param TContext - The context type (inferred from contextSchema)
 */
export interface SkillMachineResult<TContext extends MachineContext> {
  /**
   * The XState v5 machine definition.
   *
   * Can be introspected, serialized, or passed to external tooling.
   * Typed as AnyStateMachine since the full generic signature is
   * internal to XState and not ergonomic to expose.
   */
  readonly machine: AnyStateMachine;

  /**
   * Create a typed XState actor from the machine definition.
   *
   * Validates the input context against the Zod schema before
   * creating the actor. Throws if validation fails.
   *
   * @param options - Actor creation options (input is the initial context)
   * @returns A started-ready XState Actor instance
   *
   * @example
   * ```typescript
   * const actor = sm.createActor({ input: { complexity: "MODERATE" } });
   * actor.start();
   * actor.send({ type: "START" });
   * ```
   */
  readonly createActor: (options: {
    input: TContext;
  }) => ReturnType<typeof xstateCreateActor<AnyStateMachine>>;

  /**
   * Validate a context value against the machine's Zod schema.
   *
   * Uses safeParse for runtime safety.
   *
   * @param context - The context value to validate
   * @returns Object with `success: true` and `data`, or `success: false` and `error`
   *
   * @example
   * ```typescript
   * const result = sm.validateContext({ complexity: "MODERATE" });
   * if (result.success) {
   *   console.log("Valid:", result.data);
   * } else {
   *   console.error("Invalid:", result.error);
   * }
   * ```
   */
  readonly validateContext: (
    context: unknown,
  ) => { success: true; data: TContext } | { success: false; error: unknown };
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a per-skill XState v5 state machine with Zod-validated context.
 *
 * Wraps the XState `setup().createMachine()` pipeline in a functional
 * factory. The returned object is deeply frozen to prevent mutation.
 *
 * @param config - Skill machine configuration
 * @returns Deeply frozen object with machine, createActor, and validateContext
 *
 * @example
 * ```typescript
 * import { z } from "zod";
 * import { createSkillStateMachine } from "~/workflow";
 *
 * const sm = createSkillStateMachine({
 *   id: "lu-router",
 *   contextSchema: z.object({ complexity: z.string() }),
 *   initial: "idle",
 *   states: {
 *     idle: { on: { START: "running" } },
 *     running: { on: { DONE: "complete" } },
 *     complete: { type: "final" },
 *   },
 * });
 *
 * const actor = sm.createActor({ input: { complexity: "MODERATE" } });
 * actor.start();
 * ```
 */
export function createSkillStateMachine<TContext extends MachineContext>(
  config: SkillMachineConfig<TContext>,
): SkillMachineResult<TContext> {
  const { id, contextSchema, initial, states, actions, guards } = config;

  // Build the machine via XState v5 setup() API
  // Cast actions/guards to any to satisfy XState's internal type constraints.
  // The caller-facing types (SkillMachineConfig) are correctly typed.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const machineSetup = setup({
    types: {} as {
      context: TContext;
      input: TContext;
      events: AnyEventObject;
    },
    actions: actions as any,
    guards: guards as any,
  });

  const machine = machineSetup.createMachine({
    id,
    initial,
    context: ({ input }: { input: TContext }) => input,
    states: states as any,
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /**
   * Create an XState actor with Zod-validated context.
   *
   * @param options - Must include `input` matching the context schema
   * @returns An XState Actor ready to be started
   * @throws Error if input fails Zod validation
   */
  const typedCreateActor = (options: { input: TContext }) => {
    // Validate context via Zod schema before actor creation
    const parseResult = contextSchema.safeParse(options.input);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(
        `Skill state machine "${id}" context validation failed:\n${issues}`,
      );
    }

    return xstateCreateActor(machine, {
      input: parseResult.data,
    });
  };

  /**
   * Validate a context value against the machine's Zod schema.
   *
   * @param context - Value to validate
   * @returns safeParse result
   */
  const validateContext = (context: unknown) => {
    const result = contextSchema.safeParse(context);
    if (result.success) {
      return { success: true as const, data: result.data };
    }
    return { success: false as const, error: result.error };
  };

  // Return deeply frozen result to prevent mutation (matches dag-builder pattern)
  const result = {
    machine,
    createActor: typedCreateActor,
    validateContext,
  };

  return deepFreeze(result) as SkillMachineResult<TContext>;
}
