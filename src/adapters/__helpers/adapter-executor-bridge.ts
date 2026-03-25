/**
 * Bridge between the full T3 Adapter interface and the minimal T1 WorkflowAdapter
 * shape expected by the DAG executor.
 *
 * The DAG executor lives in T1 (workflow domain) and accepts a minimal
 * WorkflowAdapter type defined in `workflow.schemas.ts`. The full Adapter from the adapters
 * domain (T3) has a richer interface (compile, emit, detect, executeStep).
 *
 * This bridge wraps a full T3 Adapter into the T1 shape, handling the type
 * mapping between `AdapterStepResult` (T3) and `StepResult` (T1).
 *
 * Import direction: T3 (adapters) imports from T1 (workflow) — legal.
 *
 * @module
 */
import type {
  Adapter as FullAdapter,
  AdapterStepResult,
} from "../__schemas/adapter.schemas";
import type {
  WorkflowAdapter,
  WorkflowStep,
  StepResult,
} from "~/workflow/__schemas/workflow.schemas";

/**
 * Bridge a full T3 Adapter to the minimal T1 WorkflowAdapter shape.
 *
 * Wraps the full adapter's `executeStep` method to produce the `StepResult`
 * format that the DAG executor expects, mapping:
 * - `AdapterStepResult.success === true` -> `status: "completed"`
 * - `AdapterStepResult.success === false` -> `status: "failed"`
 * - `durationMs` is set to 0 (the DAG executor measures timing externally)
 * - `retryCount` is set to 0 (the DAG executor manages retries externally)
 *
 * @param adapter - The full T3 adapter instance (from `src/adapters/`)
 * @returns An object compatible with the T1 WorkflowAdapter type for `executeDAG()`
 * @throws {Error} If the adapter does not implement `executeStep`
 *
 * @example
 * ```typescript
 * import { createClaudeAdapter } from "~/adapters/claude/claude-adapter";
 * import { bridgeAdapterForExecutor } from "~/adapters/__helpers/adapter-executor-bridge";
 * import { executeDAG } from "~/workflow";
 *
 * const adapter = createClaudeAdapter();
 * const workflowAdapter = bridgeAdapterForExecutor(adapter);
 * const result = await executeDAG(dag, workflowAdapter, initialContext);
 * ```
 */
export function bridgeAdapterForExecutor(
  adapter: FullAdapter,
): WorkflowAdapter {
  if (!adapter.executeStep) {
    throw new Error(
      `Adapter "${adapter.config.name}" does not support step execution. ` +
        "Only adapters with executeStep can be used with the DAG executor.",
    );
  }

  const adapterExecuteStep = adapter.executeStep;

  return {
    name: adapter.config.name,
    executeStep: async (step, _input, context): Promise<StepResult> => {
      // The DAG executor always provides fully-parsed WorkflowStep instances
      // (with all defaults applied). The Zod z.function() input type makes
      // defaults optional, but at runtime they are always present. Assert
      // to the output type so the T3 adapter receives the correct shape.
      const result: AdapterStepResult = await adapterExecuteStep(
        step as WorkflowStep,
        context,
      );
      return {
        stepId: step.id,
        status: result.success ? "completed" : "failed",
        output: result.output,
        error: result.error,
        durationMs: 0, // Timing is measured by the DAG executor, not the adapter
        retryCount: 0, // Retries are managed by the DAG executor, not the adapter
      };
    },
  };
}
