/**
 * CLI command: luca doctor
 *
 * Run environment diagnostics and health checks across prerequisites,
 * global artifacts, and project configuration.
 *
 * Supports scoped checks via `--scope` flag:
 * - `prerequisites`: Bun runtime only
 * - `global`: Global artifacts, MuninnDB, framework runtime
 * - `project`: Config validation, harness installation, drift, project context
 *
 * @example
 * ```bash
 * # Run all checks
 * luca doctor
 *
 * # Run with verbose output
 * luca doctor --verbose
 *
 * # Run only global checks
 * luca doctor --scope=global
 *
 * # Run only project checks
 * luca doctor --scope=project
 * ```
 */
import { defineCommand } from "citty";

import { executeDoctor } from "../utils/doctor";

import type { DoctorScope } from "../utils/doctor/types";

/** Valid scope values for the --scope argument. */
const VALID_SCOPES: DoctorScope[] = ["prerequisites", "global", "project"];

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Run environment diagnostics and health checks",
  },
  args: {
    verbose: {
      type: "boolean",
      description: "Show detailed check information",
      alias: "v",
      default: false,
    },
    scope: {
      type: "string",
      description: "Filter checks by scope: prerequisites, global, or project",
      alias: "s",
    },
  },
  async run({ args }) {
    // Validate scope if provided
    const scope = args.scope as DoctorScope | undefined;
    if (scope && !VALID_SCOPES.includes(scope)) {
      console.error(
        `Invalid --scope value: "${scope}". Valid options: ${VALID_SCOPES.join(", ")}`,
      );
      process.exit(1);
    }

    const exitCode = await executeDoctor({
      verbose: args.verbose,
      scope,
    });
    process.exit(exitCode);
  },
});
