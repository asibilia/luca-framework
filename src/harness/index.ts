/**
 * Public API for the verification harness module.
 *
 * Exports the runner, parser registry, types, schemas, and default config.
 */

export { runHarness, loadHarnessConfig } from "./runner";
export { parserRegistry } from "./parsers";
export type {
  HarnessConfig,
  CheckConfig,
  ParsedError,
  CheckResult,
  HarnessResult,
  OutputParser,
} from "./harness.schemas";
export {
  CheckConfigSchema,
  HarnessConfigSchema,
  ParsedErrorSchema,
  CheckResultSchema,
  HarnessResultSchema,
  DEFAULT_HARNESS_CONFIG,
} from "./harness.schemas";
