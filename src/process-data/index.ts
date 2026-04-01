/**
 * Process-data module for deterministic phase metrics computation.
 *
 * Replaces the former `lu-process-data` Agent() call with a zero-LLM
 * CLI module. Reads state.json, computes aggregates, writes results.
 *
 * CLI entry: `bun src/process-data/compute.ts --context=<path>`
 *
 * @module process-data
 */

// Schemas
export {
  harnessRunSchema,
  taskEntrySchema,
  processDataInputSchema,
  processDataMetricsSchema,
} from "./__schemas/process-data.schemas";

export type {
  HarnessRun,
  TaskEntry,
  ProcessDataInput,
  ProcessDataMetrics,
} from "./__schemas/process-data.schemas";

// Core compute function
export { computeMetrics } from "./compute";
