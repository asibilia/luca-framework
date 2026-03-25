/**
 * Fluent API for constructing workflow DAGs.
 *
 * Uses the Mastra pattern: accumulate steps via chainable `.step()` calls,
 * then finalize with `.build()` which validates and freezes the result.
 *
 * Uses functional closures (no classes) per no-classes rule.
 *
 * @example
 * ```typescript
 * import { buildPhaseDAG } from "~/workflow";
 * import { ClassifyOutputSchema } from "~/workflow";
 *
 * const dag = buildPhaseDAG("my-pipeline")
 *   .step("classify", {
 *     handler: "lu-router",
 *     outputSchema: ClassifyOutputSchema,
 *     metadata: { category: "classify" },
 *   })
 *   .step("discuss", {
 *     handler: "phase-discuss",
 *     dependsOn: ["classify"],
 *     metadata: { category: "discuss" },
 *   })
 *   .build();
 * ```
 *
 * @see docs/runtime-architecture/dag-workflow-engine.md — DAG Builder
 * @see docs/runtime-architecture/research/dag-engines.md — Pattern #1 (Fluent builder with .build())
 */

import type { z } from "zod";

import { deepFreeze } from "~/shared/__helpers/deep-freeze";

import {
  WorkflowDAGSchema,
  WorkflowStepSchema,
} from "../__schemas/workflow.schemas";

import type { WorkflowDAG } from "../__schemas/workflow.schemas";

// ─── Step Config ─────────────────────────────────────────────────────────────

/**
 * Configuration for a single step, passed to the `.step()` method.
 *
 * All fields from WorkflowStep except `id` (provided as the first argument)
 * and `name` (defaults to `id` if not provided).
 */
export interface StepConfig {
  /** Human-readable name. Defaults to the step ID if omitted. */
  name?: string;

  /** Handler key — maps to a registered step handler in the adapter. */
  handler: string;

  /** IDs of steps that must complete before this step can start. */
  dependsOn?: string[];

  /** Input Zod schema — validated before step executes. */
  inputSchema?: z.ZodTypeAny;

  /** Output Zod schema — validated after step completes. */
  outputSchema?: z.ZodTypeAny;

  /**
   * Guard condition — if it returns false, step is skipped.
   * Receives the accumulated execution context.
   */
  guard?: (ctx: Record<string, unknown>) => boolean;

  /** Retry configuration. */
  retry?: { max?: number; backoff?: "none" | "linear" | "exponential" };

  /** Timeout in milliseconds for step execution. */
  timeout?: number;

  /** Metadata for visualization and debugging. */
  metadata?: {
    description?: string;
    category?:
      | "classify"
      | "discuss"
      | "plan"
      | "execute"
      | "verify"
      | "learn"
      | "commit"
      | "gate";
    parallel?: boolean;
  };
}

// ─── Builder Interface ───────────────────────────────────────────────────────

/**
 * Chainable builder for constructing a WorkflowDAG.
 */
export interface DAGBuilder {
  /**
   * Add a step to the DAG.
   *
   * @param id - Unique step identifier
   * @param config - Step configuration
   * @returns The builder instance for chaining
   */
  step(id: string, config: StepConfig): DAGBuilder;

  /**
   * Define a named parallel group (fan-out/fan-in).
   *
   * @param name - Group name
   * @param stepIds - IDs of steps in this parallel group
   * @returns The builder instance for chaining
   */
  parallelGroup(name: string, stepIds: string[]): DAGBuilder;

  /**
   * Set the global workflow timeout.
   *
   * @param ms - Timeout in milliseconds
   * @returns The builder instance for chaining
   */
  timeout(ms: number): DAGBuilder;

  /**
   * Set the workflow version.
   *
   * @param semver - Semantic version string (e.g., "1.0.0")
   * @returns The builder instance for chaining
   */
  version(semver: string): DAGBuilder;

  /**
   * Finalize and return the immutable WorkflowDAG.
   *
   * Validates the accumulated definition via WorkflowDAGSchema.safeParse().
   * Deep-freezes the result to prevent mutation after construction.
   *
   * @returns A deeply frozen, validated WorkflowDAG
   * @throws Error if the accumulated definition fails schema validation
   */
  build(): Readonly<WorkflowDAG>;
}

// ─── Builder Factory ─────────────────────────────────────────────────────────

/**
 * Create a new DAG builder.
 *
 * Returns a chainable builder that accumulates steps and configuration,
 * then finalizes with `.build()` which validates and freezes the result.
 *
 * @param name - The workflow name
 * @returns A chainable DAGBuilder instance
 *
 * @example
 * ```typescript
 * const dag = buildPhaseDAG("phase-pipeline")
 *   .step("classify", { handler: "lu-router" })
 *   .step("discuss", { handler: "phase-discuss", dependsOn: ["classify"] })
 *   .build();
 * ```
 */
export function buildPhaseDAG(name: string): DAGBuilder {
  const steps: z.input<typeof WorkflowStepSchema>[] = [];
  const groups: Record<string, string[]> = {};
  let globalTimeout: number | undefined;
  let versionStr = "1.0.0";

  const builder: DAGBuilder = {
    step(id: string, config: StepConfig): DAGBuilder {
      const step: z.input<typeof WorkflowStepSchema> = {
        id,
        name: config.name ?? id,
        handler: config.handler,
        dependsOn: config.dependsOn ?? [],
        inputSchema: config.inputSchema,
        outputSchema: config.outputSchema,
        guard: config.guard,
        retry: config.retry,
        timeout: config.timeout,
        metadata: config.metadata,
      };
      steps.push(step);
      return builder;
    },

    parallelGroup(name: string, stepIds: string[]): DAGBuilder {
      groups[name] = stepIds;
      return builder;
    },

    timeout(ms: number): DAGBuilder {
      globalTimeout = ms;
      return builder;
    },

    version(semver: string): DAGBuilder {
      versionStr = semver;
      return builder;
    },

    build(): Readonly<WorkflowDAG> {
      const raw = {
        name,
        version: versionStr,
        steps,
        parallelGroups: Object.keys(groups).length > 0 ? groups : undefined,
        timeout: globalTimeout,
      };

      const parseResult = WorkflowDAGSchema.safeParse(raw);

      if (!parseResult.success) {
        const issues = parseResult.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n");
        throw new Error(
          `DAG builder validation failed for "${name}":\n${issues}`,
        );
      }

      return deepFreeze(parseResult.data) as Readonly<WorkflowDAG>;
    },
  };

  return builder;
}
