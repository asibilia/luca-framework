/**
 * Stack-aware harness config template factory.
 *
 * Generates appropriate verification harness configuration based on the
 * detected project stack. This ensures new projects get sensible defaults
 * for test, typecheck, lint, and build commands without manual configuration.
 *
 * @module harness-templates
 *
 * @example
 * ```typescript
 * import { getHarnessTemplate } from "./harness-templates";
 *
 * const harness = getHarnessTemplate("node-ts");
 * // {
 * //   enabled: true,
 * //   maxFixIterations: 2,
 * //   failFast: false,
 * //   checks: [
 * //     { name: "test", command: "bun test", enabled: true, timeout: 120, parser: "bun-test" },
 * //     { name: "typecheck", command: "bunx --bun tsc --noEmit", enabled: true, timeout: 60, parser: "tsc" },
 * //     { name: "lint", command: "bunx --bun eslint . --format json", enabled: false, timeout: 60, parser: "eslint" },
 * //     { name: "build", command: "bun run build", enabled: false, timeout: 120, parser: "generic" },
 * //   ]
 * // }
 * ```
 */

import { z } from "zod";

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Schema for a single harness check entry.
 *
 * Matches the shape used in `.planning/config.json` harness.checks[].
 */
export const HarnessCheckSchema = z.object({
  name: z.enum(["test", "typecheck", "lint", "build"]),
  command: z.string(),
  enabled: z.boolean(),
  timeout: z.number().int().positive(),
  parser: z.enum(["bun-test", "tsc", "eslint", "generic"]),
});

/**
 * Schema for the full harness configuration object.
 *
 * Matches the `harness` section of `.planning/config.json`.
 */
export const HarnessTemplateSchema = z.object({
  enabled: z.boolean(),
  maxFixIterations: z.number().int().positive(),
  failFast: z.boolean(),
  checks: z.array(HarnessCheckSchema),
});

/** Inferred type for a single harness check. */
export type HarnessCheck = z.infer<typeof HarnessCheckSchema>;

/** Inferred type for the full harness configuration. */
export type HarnessTemplate = z.infer<typeof HarnessTemplateSchema>;

// ─── Stack-specific check definitions ────────────────────────────────────────

/**
 * Harness checks for TypeScript stacks (react-ts, node-ts).
 *
 * - test: enabled (bun test)
 * - typecheck: enabled (tsc --noEmit)
 * - lint: disabled by default (eslint)
 * - build: disabled by default (bun run build)
 */
const typescriptChecks: HarnessCheck[] = [
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
    command: "bun run build",
    enabled: false,
    timeout: 120,
    parser: "generic",
  },
];

/**
 * Harness checks for JavaScript stacks (react, node).
 *
 * - test: enabled (bun test)
 * - typecheck: disabled (no TypeScript)
 * - lint: disabled by default (eslint)
 * - build: disabled by default (bun run build)
 */
const javascriptChecks: HarnessCheck[] = [
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
    enabled: false,
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
    command: "bun run build",
    enabled: false,
    timeout: 120,
    parser: "generic",
  },
];

/**
 * Harness checks for unknown stacks.
 *
 * All checks disabled by default -- user must configure manually.
 */
const unknownChecks: HarnessCheck[] = [
  {
    name: "test",
    command: "bun test",
    enabled: false,
    timeout: 120,
    parser: "bun-test",
  },
  {
    name: "typecheck",
    command: "bunx --bun tsc --noEmit",
    enabled: false,
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
    command: "bun run build",
    enabled: false,
    timeout: 120,
    parser: "generic",
  },
];

// ─── Stack-to-checks mapping ────────────────────────────────────────────────

const stackChecksMap: Record<string, HarnessCheck[]> = {
  "react-ts": typescriptChecks,
  "node-ts": typescriptChecks,
  react: javascriptChecks,
  node: javascriptChecks,
};

// ─── Factory function ────────────────────────────────────────────────────────

/**
 * Generate a harness configuration template for a given project stack.
 *
 * Returns a complete `harness` config object matching the `.planning/config.json`
 * shape, with check commands and enabled states tailored to the stack:
 *
 * | Stack              | test    | typecheck | lint     | build    |
 * |--------------------|---------|-----------|----------|----------|
 * | react-ts / node-ts | enabled | enabled   | disabled | disabled |
 * | react / node       | enabled | disabled  | disabled | disabled |
 * | unknown / fallback | disabled| disabled  | disabled | disabled |
 *
 * @param stack - Detected project stack identifier (e.g., "react-ts", "node", "unknown")
 * @returns Validated harness configuration object
 *
 * @example
 * ```typescript
 * const harness = getHarnessTemplate("react-ts");
 * // harness.checks[0].name === "test"
 * // harness.checks[0].enabled === true
 * // harness.checks[1].name === "typecheck"
 * // harness.checks[1].enabled === true
 * ```
 */
export function getHarnessTemplate(stack: string): HarnessTemplate {
  const checks = stackChecksMap[stack] ?? unknownChecks;

  const template: HarnessTemplate = {
    enabled: true,
    maxFixIterations: 2,
    failFast: false,
    checks,
  };

  // Validate the output through the schema (safety net)
  return HarnessTemplateSchema.parse(template);
}
