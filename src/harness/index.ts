/**
 * Public API for the verification harness module.
 *
 * Exports the runner, parser registry, types, schemas, and default config.
 */

export { runHarness, loadHarnessConfig } from "./__helpers/runner";
export { parserRegistry } from "./parsers";
export type {
  HarnessConfig,
  CheckConfig,
  ParsedError,
  CheckResult,
  HarnessResult,
  OutputParser,
  MiddlewareContext,
  CheckMiddlewareConfig,
  MiddlewarePipelineConfig,
  MiddlewareResult,
  CheckMiddleware,
} from "./__schemas/harness.schemas";
export {
  CheckConfigSchema,
  HarnessConfigSchema,
  ParsedErrorSchema,
  CheckResultSchema,
  HarnessResultSchema,
  DEFAULT_HARNESS_CONFIG,
  MiddlewareContextSchema,
  CheckMiddlewareConfigSchema,
  MiddlewarePipelineConfigSchema,
  MiddlewareResultSchema,
} from "./__schemas/harness.schemas";
