/**
 * Type definitions for the Luca verification harness.
 *
 * The harness orchestrates running test/lint/typecheck/build as a single
 * command, parses toolchain output into structured errors, and returns
 * typed results.
 *
 * All data-shape types are derived from Zod schemas via z.infer.
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

/** Top-level harness configuration (maps to config.json "harness" section) */
export const HarnessConfigSchema = z.object({
  enabled: z.boolean(),
  checks: z.array(CheckConfigSchema),
  maxFixIterations: z.number().int().positive(),
  failFast: z.boolean(),
});
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

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

/** Result of running a single check */
export const CheckResultSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped", "timeout"]),
  exitCode: z.number().int(),
  errors: z.array(ParsedErrorSchema),
  warnings: z.array(ParsedErrorSchema),
  rawOutput: z.string(),
  duration: z.number().nonnegative(),
});
export type CheckResult = z.infer<typeof CheckResultSchema>;

/** Aggregate result of running all checks */
export const HarnessResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  checks: z.array(CheckResultSchema),
  totalErrors: z.number().int().nonnegative(),
  totalWarnings: z.number().int().nonnegative(),
  duration: z.number().nonnegative(),
  timestamp: z.string(),
});
export type HarnessResult = z.infer<typeof HarnessResultSchema>;

/** Parser function signature — not a Zod schema (functions are not serializable) */
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
});
