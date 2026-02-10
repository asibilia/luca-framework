/**
 * Public API for the verification harness module.
 *
 * Exports the runner, parser registry, types, and default config.
 */

export { runHarness, loadHarnessConfig } from './runner';
export { parserRegistry } from './parsers';
export type { HarnessConfig, CheckConfig, ParsedError, CheckResult, HarnessResult, OutputParser } from './types';
export { DEFAULT_HARNESS_CONFIG } from './types';
