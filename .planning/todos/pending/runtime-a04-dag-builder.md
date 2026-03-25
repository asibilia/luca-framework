---
title: "Runtime A04: Implement DAG builder fluent API"
area: workflow
created: 2026-03-24
source: docs/runtime-architecture/dag-workflow-engine.md
depends_on: [A01, A02]
phase: runtime-a
estimated_files: 2
---

## Context

Implement the fluent builder API for constructing workflow DAGs. The builder accumulates steps during construction, then finalizes with `.build()` which validates via `WorkflowDAGSchema.safeParse()` and deep-freezes the result to prevent mutation. This pattern is borrowed from Mastra's workflow builder. Uses functional closures (no classes) per the no-classes rule.

## Task

### Files to Create

#### `src/workflow/__helpers/dag-builder.ts`

````typescript
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

import { deepFreeze } from "~/shared/__helpers/deep-freeze.ts";

import { WorkflowDAGSchema } from "../__schemas/workflow.schemas.ts";

import type {
  WorkflowStep,
  WorkflowDAG,
} from "../__schemas/workflow.schemas.ts";

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
  const steps: WorkflowStep[] = [];
  const groups: Record<string, string[]> = {};
  let globalTimeout: number | undefined;
  let versionStr = "1.0.0";

  const builder: DAGBuilder = {
    step(id: string, config: StepConfig): DAGBuilder {
      const step: WorkflowStep = {
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
````

### Files to Modify

#### `src/workflow/index.ts`

Replace the `// Added by A04` placeholder comment under `DAG Builder` with actual exports:

```typescript
// ─── DAG Builder ─────────────────────────────────────────────────────────────

export { buildPhaseDAG } from "./__helpers/dag-builder.ts";
export type { StepConfig, DAGBuilder } from "./__helpers/dag-builder.ts";
```

## Verification

- [ ] `bunx --bun tsc --noEmit` passes
- [ ] `buildPhaseDAG("test").step("a", { handler: "h" }).build()` returns a frozen `WorkflowDAG` object
- [ ] `.build()` throws an Error with descriptive message if schema validation fails (e.g., step with empty `id`)
- [ ] The returned object is deeply frozen (mutations throw in strict mode)
- [ ] No classes are used — only functional closures
- [ ] Barrel index only contains re-export statements

## Notes

- Depends on: A01 (directory structure), A02 (WorkflowDAGSchema, WorkflowStep type)
- The `StepConfig` interface uses native TypeScript types instead of Zod schemas for the config parameter because the builder is a construction API, not a parsing boundary. Validation happens in `.build()` via `WorkflowDAGSchema.safeParse()`.
- The builder imports `deepFreeze` from `~/shared/__helpers/deep-freeze.ts` — this is an allowed import path per the module-boundary rule (shared `__helpers/` is exempt from the encapsulation rule).
- The `guard` field accepts `(ctx: Record<string, unknown>) => boolean`. Guards are evaluated at step execution time by the executor (A07), not at build time.
