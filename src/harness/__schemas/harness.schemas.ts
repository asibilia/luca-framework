/**
 * Type definitions for the Luca verification harness.
 *
 * **Internal-only schemas** — not used as API request/response payloads.
 * Uses camelCase per TypeScript conventions for internal runtime types.
 * The harness runner serializes to snake_case when writing
 * `harness-result.json` for external consumption (see runner.ts
 * `snakeCaseResult` transform in `runHarness()`).
 *
 * The harness orchestrates running test/lint/typecheck/build as a single
 * command, parses toolchain output into structured errors, and returns
 * typed results.
 *
 * All data-shape types are derived from Zod schemas via z.infer.
 * Function types (CheckMiddleware, OutputParser) use TypeScript type
 * aliases since functions are not serializable in Zod.
 */

import { z } from "zod";

/** Configuration for a single check in the harness */
export const CheckConfigSchema = z.object({
  name: z.string(),
  command: z.string(),
  enabled: z.boolean(),
  timeout: z.number().positive(),
  parser: z.string(),
});
export type CheckConfig = z.infer<typeof CheckConfigSchema>;

/** A single parsed error from toolchain output */
export const ParsedErrorSchema = z.object({
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  message: z.string(),
  code: z.string().optional(),
  severity: z.enum(["error", "warning"]),
});
export type ParsedError = z.infer<typeof ParsedErrorSchema>;

/* -------------------------------------------------------------------------- */
/*  Middleware schemas                                                         */
/* -------------------------------------------------------------------------- */

/** Context passed through the middleware pipeline for a single check */
export const MiddlewareContextSchema = z.object({
  /** The check configuration being executed */
  check: CheckConfigSchema,
  /** Project directory for workspace-scoping */
  projectDir: z.string(),
  /** Metadata bag for middleware to attach data */
  metadata: z.record(z.string(), z.unknown()).default({}),
  /** High-resolution start timestamp (set by timing middleware) */
  startedAt: z.string().optional(),
  /** High-resolution end timestamp (set by timing middleware) */
  endedAt: z.string().optional(),
  /** Workspace-scoped file paths (set by workspace-scoping middleware) */
  scopedFiles: z.array(z.string()).optional(),
  /** Captured raw output path (set by output-capture middleware) */
  outputPath: z.string().optional(),
});
export type MiddlewareContext = z.infer<typeof MiddlewareContextSchema>;

/** Configuration for a single middleware in the pipeline */
export const CheckMiddlewareConfigSchema = z.object({
  /** Unique middleware name */
  name: z.string(),
  /** Whether this middleware is enabled */
  enabled: z.boolean().default(true),
  /** Middleware-specific options */
  options: z.record(z.string(), z.unknown()).default({}),
});
export type CheckMiddlewareConfig = z.infer<typeof CheckMiddlewareConfigSchema>;

/** Pipeline configuration: ordered array of middleware configs */
export const MiddlewarePipelineConfigSchema = z.object({
  /** Whether the middleware pipeline is enabled */
  enabled: z.boolean().default(true),
  /** Ordered middleware configurations (execution order matters) */
  middleware: z.array(CheckMiddlewareConfigSchema).default([]),
});
export type MiddlewarePipelineConfig = z.infer<
  typeof MiddlewarePipelineConfigSchema
>;

/** Middleware-enriched result metadata attached to CheckResult */
export const MiddlewareResultSchema = z.object({
  /** Middleware pipeline execution duration in ms */
  pipelineDuration: z.number().nonnegative().default(0),
  /** Per-middleware timing in ms */
  middlewareTiming: z.record(z.string(), z.number().nonnegative()).default({}),
  /** Metadata accumulated by middleware */
  metadata: z.record(z.string(), z.unknown()).default({}),
  /** Whether the pipeline completed successfully */
  pipelineStatus: z
    .enum(["completed", "error", "skipped"])
    .default("completed"),
  /** Error message if pipeline failed */
  pipelineError: z.string().optional(),
});
export type MiddlewareResult = z.infer<typeof MiddlewareResultSchema>;

/**
 * Middleware function signature.
 *
 * Each middleware receives the context and a `next` function.
 * Call `next(ctx)` to continue the pipeline. Middleware can:
 * - Modify ctx before calling next (pre-processing)
 * - Inspect/modify the result after next returns (post-processing)
 * - Skip next entirely (short-circuit)
 *
 * Not a Zod schema (functions are not serializable).
 */
export type CheckMiddleware = (
  ctx: MiddlewareContext,
  next: (ctx: MiddlewareContext) => Promise<CheckResult>,
) => Promise<CheckResult>;

/* -------------------------------------------------------------------------- */
/*  Harness configuration & result schemas                                    */
/* -------------------------------------------------------------------------- */

/** Top-level harness configuration (maps to config.json "harness" section) */
export const HarnessConfigSchema = z.object({
  enabled: z.boolean(),
  checks: z.array(CheckConfigSchema),
  maxFixIterations: z.number().int().positive(),
  failFast: z.boolean(),
  /** Optional middleware pipeline configuration */
  middlewarePipeline: MiddlewarePipelineConfigSchema.optional(),
});
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

/** Result of running a single check */
export const CheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped", "timeout"]),
  /** Internal: check process exit code */
  exitCode: z.number().int(),
  errors: z.array(ParsedErrorSchema),
  warnings: z.array(ParsedErrorSchema),
  /** Internal: truncated combined stdout+stderr output */
  rawOutput: z.string(),
  duration: z.number().nonnegative(),
  /** Middleware pipeline result metadata (present when middleware is enabled) */
  middlewareResult: MiddlewareResultSchema.optional(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** Aggregate result of running all checks */
export const HarnessResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  checks: z.array(CheckResultSchema),
  /** Internal: total error count across all checks */
  totalErrors: z.number().int().nonnegative(),
  /** Internal: total warning count across all checks */
  totalWarnings: z.number().int().nonnegative(),
  duration: z.number().nonnegative(),
  timestamp: z.string(),
});
export type HarnessResult = z.infer<typeof HarnessResultSchema>;

/** Parser function signature -- not a Zod schema (functions are not serializable) */
export type OutputParser = (output: string) => ParsedError[];

/** Default harness config used when no config.json harness section exists */
export const DEFAULT_HARNESS_CONFIG: HarnessConfig = HarnessConfigSchema.parse({
  enabled: true,
  maxFixIterations: 3,
  failFast: false,
  checks: [
    {
      name: "test",
      command: "bun test",
      enabled: true,
      timeout: 120,
      parser: "bun-test",
    },
    {
      name: "typecheck",
      command: "bunx --bun tsc --noEmit",
      enabled: true,
      timeout: 60,
      parser: "tsc",
    },
    {
      name: "lint",
      command: "bunx --bun eslint . --format json",
      enabled: false,
      timeout: 60,
      parser: "eslint",
    },
    {
      name: "build",
      command: "bun run build:all",
      enabled: false,
      timeout: 120,
      parser: "generic",
    },
  ],
  middlewarePipeline: {
    enabled: true,
    middleware: [
      { name: "timing", enabled: true },
      { name: "workspace-scope", enabled: true },
      { name: "output-capture", enabled: true },
    ],
  },
});
