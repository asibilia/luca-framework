/**
 * Type definitions for the Luca verification harness.
 *
 * The harness orchestrates running test/lint/typecheck/build as a single
 * command, parses toolchain output into structured errors, and returns
 * typed results.
 */

/** Configuration for a single check in the harness */
export interface CheckConfig {
  name: string;            // e.g., "test", "typecheck", "lint", "build"
  command: string;          // e.g., "bun test", "bunx --bun tsc --noEmit"
  enabled: boolean;
  timeout: number;          // seconds
  parser: string;           // parser key from parser registry: "bun-test", "tsc", "eslint", "generic"
}

/** Top-level harness configuration (maps to config.json "harness" section) */
export interface HarnessConfig {
  enabled: boolean;
  checks: CheckConfig[];
  maxFixIterations: number;
  failFast: boolean;
}

/** A single parsed error from toolchain output */
export interface ParsedError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;            // e.g., TS2345, ESLint rule name
  severity: 'error' | 'warning';
}

/** Result of running a single check */
export interface CheckResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'timeout';
  exitCode: number;
  errors: ParsedError[];
  warnings: ParsedError[];
  rawOutput: string;        // truncated to last N lines
  duration: number;         // milliseconds
}

/** Aggregate result of running all checks */
export interface HarnessResult {
  status: 'passed' | 'failed';
  checks: CheckResult[];
  totalErrors: number;
  totalWarnings: number;
  duration: number;         // milliseconds
  timestamp: string;        // ISO 8601
}

/** Parser function signature */
export type OutputParser = (output: string) => ParsedError[];

/** Default harness config used when no config.json harness section exists */
export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  enabled: true,
  maxFixIterations: 3,
  failFast: false,
  checks: [
    { name: 'test', command: 'bun test', enabled: true, timeout: 120, parser: 'bun-test' },
    { name: 'typecheck', command: 'bunx --bun tsc --noEmit', enabled: true, timeout: 60, parser: 'tsc' },
    { name: 'lint', command: 'bunx --bun eslint . --format json', enabled: false, timeout: 60, parser: 'eslint' },
    { name: 'build', command: 'bun run build:all', enabled: false, timeout: 120, parser: 'generic' },
  ],
};
