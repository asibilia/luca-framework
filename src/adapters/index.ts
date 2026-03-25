/**
 * Public API for the adapters module.
 *
 * Provides the adapter interface, registry, and built-in adapters
 * for compiling Luca definitions to multiple target environments.
 *
 * Built-in adapters (Claude, API) are pre-registered via a separate
 * side-effect module (register-builtins.ts), NOT imported here.
 * Barrel imports must not have side effects.
 *
 * **Side-effect import required:** Consumers that need built-in adapters
 * registered in the global registry must import the registration module:
 * ```typescript
 * import "~/adapters/__helpers/register-builtins";
 * ```
 * This import triggers adapter registration as a side effect.
 */

// ─── Schemas and Types ─────────────────────────────────────────────────────
export {
  AdapterSupportedFeaturesSchema,
  AdapterConfigSchema,
  EmitResultSchema,
  AdapterStepResultSchema,
} from "./__schemas/adapter.schemas";
export type {
  AdapterSupportedFeatures,
  AdapterConfig,
  EmitResult,
  AdapterStepResult,
  Adapter,
} from "./__schemas/adapter.schemas";

// ─── Registry ──────────────────────────────────────────────────────────────
export {
  registerAdapter,
  getAdapter,
  listRegisteredAdapters,
  listRegisteredAdapterNames,
  detectAdapter,
  resetAdapterRegistry,
  DETECTION_ORDER,
} from "./__helpers/adapter-registry";

// ─── Adapter-Executor Bridge ───────────────────────────────────────────────
export { bridgeAdapterForExecutor } from "./__helpers/adapter-executor-bridge";

// ─── Character Budget ─────────────────────────────────────────────────────
export { enforceCharacterBudget } from "./__helpers/character-budget";
export type { CharacterBudgetResult } from "./__helpers/character-budget";

// ─── Claude Adapter ────────────────────────────────────────────────────────
export { createClaudeAdapter } from "./claude";
export { emitAgentMarkdown } from "./claude";
export { emitSkillMarkdown, emitSkillPluginMarkdown } from "./claude";

// ─── API Adapter ───────────────────────────────────────────────────────────
export { createApiAdapter, ApiAdapterOptionsSchema } from "./api";
export type { ApiAdapterOptions } from "./api";
export {
  ApiExecutorConfigSchema,
  AdapterTokenUsageSchema,
  executeViaSDK,
} from "./api";
export type { ApiExecutorConfig, AdapterTokenUsage } from "./api";

// ─── Windsurf Adapter ─────────────────────────────────────────────────────
export {
  createWindsurfAdapter,
  FORMAT_VERSION as WINDSURF_FORMAT_VERSION,
} from "./windsurf";
export { WINDSURF_EVENT_MAP, translateWindsurfEvent } from "./windsurf";
