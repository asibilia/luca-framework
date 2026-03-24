/**
 * Public API for the adapters module.
 *
 * Provides the adapter interface, registry, and built-in adapters
 * for compiling Luca definitions to multiple target environments.
 *
 * Built-in adapters (Claude, API) are pre-registered via a separate
 * side-effect module (register-builtins.ts), NOT imported here.
 * Barrel imports must not have side effects.
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

// ─── Claude Adapter ────────────────────────────────────────────────────────
export { createClaudeAdapter } from "./claude";
export { emitAgentMarkdown } from "./claude";
export { emitSkillMarkdown, emitSkillPluginMarkdown } from "./claude";

// ─── API Adapter ───────────────────────────────────────────────────────────
export { createApiAdapter, ApiAdapterOptionsSchema } from "./api";
export type { ApiAdapterOptions } from "./api";
export {
  ApiExecutorConfigSchema,
  TokenUsageSchema,
  executeViaSDK,
} from "./api";
export type { ApiExecutorConfig, TokenUsage } from "./api";
