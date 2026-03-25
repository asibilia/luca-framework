/**
 * Zod schemas and types for the Luca Framework adapter domain.
 *
 * Defines the Adapter interface — the contract that all concrete adapters
 * (Claude, Cursor, Windsurf, VS Code, API) implement. Includes schemas
 * for adapter configuration, feature support flags, emission results,
 * and step execution results.
 *
 * The `Adapter` type is a TypeScript type (not a Zod schema) because it
 * contains function properties which are not serializable.
 */
import { z } from "zod";

import type { BaseAgent } from "~/agents";
import type { BaseSkill } from "~/skills";
import type { BaseRule } from "~/rules";
import type { WorkflowStep } from "~/workflow";
import type { CompatibilityReport } from "./compatibility-report.schemas";

/**
 * Describes what features an adapter supports.
 *
 * Each flag indicates whether the adapter can compile or execute
 * a particular entity type or capability.
 */
export const AdapterSupportedFeaturesSchema = z.object({
  /** Whether this adapter compiles agent definitions */
  agents: z.boolean().default(true),
  /** Whether this adapter compiles skill definitions */
  skills: z.boolean().default(true),
  /** Whether this adapter compiles rule definitions */
  rules: z.boolean().default(true),
  /** Whether this adapter supports lifecycle hooks */
  hooks: z.boolean().default(false),
  /** Whether this adapter supports DAG workflow execution */
  workflows: z.boolean().default(false),
  /** Whether this adapter can run without an IDE (headless/CI) */
  headless: z.boolean().default(false),
});

/**
 * Adapter identity and capability configuration.
 *
 * Contains the adapter's unique name (used as the registry key),
 * a human-readable description, and its feature support flags.
 */
export const AdapterConfigSchema = z.object({
  /** Unique adapter name used as registry key (e.g., "claude", "api", "cursor") */
  name: z.string().min(1),
  /** Human-readable description of the adapter */
  description: z.string(),
  /** Feature support flags */
  supportedFeatures: AdapterSupportedFeaturesSchema,
});

/**
 * Result of writing compiled artifacts to disk.
 *
 * Returned by an adapter's `emit()` method after writing files
 * to the output directory.
 */
export const EmitResultSchema = z.object({
  /** Number of files written to disk */
  filesWritten: z.number().int().nonnegative().default(0),
  /** Absolute paths of files written */
  filesPaths: z.array(z.string()).default([]),
  /** Warnings encountered during emission (non-fatal) */
  warnings: z.array(z.string()).default([]),
});

/**
 * Result of executing a single DAG step via an adapter.
 *
 * This is the adapter-specific step result, distinct from the workflow
 * domain's generic `StepResult` which adds timing and retry metadata.
 * The adapter returns this; the DAG executor wraps it into the full StepResult.
 */
export const AdapterStepResultSchema = z.object({
  /** Whether the step execution succeeded */
  success: z.boolean(),
  /** The step's output data (adapter-specific format) */
  output: z.unknown().optional(),
  /** Error message if success is false */
  error: z.string().optional(),
  /** Token usage for API-based adapters (null for IDE adapters) */
  tokenUsage: z
    .object({
      inputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Inferred types from Zod schemas
// ---------------------------------------------------------------------------

export type AdapterConfig = z.infer<typeof AdapterConfigSchema>;
export type AdapterSupportedFeatures = z.infer<
  typeof AdapterSupportedFeaturesSchema
>;
export type EmitResult = z.infer<typeof EmitResultSchema>;
export type AdapterStepResult = z.infer<typeof AdapterStepResultSchema>;

// ---------------------------------------------------------------------------
// Adapter type — the full adapter interface
// ---------------------------------------------------------------------------

/**
 * The full adapter interface that all concrete adapters implement.
 *
 * IDE adapters (Claude, Cursor, Windsurf, VS Code) compile entity definitions
 * to markdown and emit them as files. The API adapter compiles to structured
 * objects and can execute DAG workflow steps.
 *
 * Defined as a TypeScript type (not a Zod schema) because it contains
 * function properties which are not serializable.
 */
export type Adapter = {
  /** Adapter identity and capability flags */
  readonly config: AdapterConfig;

  /**
   * Compile an agent definition to the target format.
   *
   * IDE adapters return a markdown string.
   * API adapter returns a structured object for use as a system prompt.
   *
   * @param agent - The agent definition to compile
   * @returns Compiled output (string for IDE adapters, object for API adapter)
   */
  compileAgent: (agent: BaseAgent) => string | Record<string, unknown>;

  /**
   * Compile a skill definition to the target format.
   *
   * @param skill - The skill definition to compile
   * @returns Compiled output (string for IDE adapters, object for API adapter)
   */
  compileSkill: (skill: BaseSkill) => string | Record<string, unknown>;

  /**
   * Compile a rule definition to the target format.
   * Optional because not all adapters support individual rule files
   * (e.g., API adapter folds rules into agent system prompts).
   *
   * @param rule - The rule definition to compile
   * @returns Compiled output
   */
  compileRule?: (rule: BaseRule) => string | Record<string, unknown>;

  /**
   * Execute a single DAG workflow step in this environment.
   * Optional because IDE adapters compile but do not execute.
   *
   * @param step - The workflow step to execute
   * @param context - Accumulated execution context from prior steps
   * @returns The step execution result
   */
  executeStep?: (
    step: WorkflowStep,
    context: Record<string, unknown>,
  ) => Promise<AdapterStepResult>;

  /**
   * Validate compiled output against IDE-specific constraints.
   * Optional because not all adapters have per-IDE constraint validators.
   *
   * When present, the report CLI prefers this method over the standalone
   * VALIDATOR_MAP lookup, enabling adapters to own their own validation logic.
   *
   * @param emitResult - The result of a prior emit() call
   * @returns A structured compatibility report for this adapter
   */
  validate?: (emitResult: EmitResult) => Promise<CompatibilityReport>;

  /**
   * Write compiled artifacts to disk (e.g., .claude/ directory).
   *
   * @param outputDir - Root directory for output artifacts
   * @returns Summary of files written
   */
  emit: (outputDir: string) => Promise<EmitResult>;

  /**
   * Detect whether this adapter's target environment exists at the given project root.
   * Used by auto-detection in the adapter registry.
   *
   * @param projectRoot - Absolute path to the project root
   * @returns true if this adapter's environment is detected
   */
  detect: (projectRoot: string) => boolean;
};
