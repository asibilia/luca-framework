/**
 * Public API for the hooks module.
 *
 * Exports hook schemas, registry, config generators, and Claude Code adapter.
 */

// Schemas and types — canonical (platform-independent)
export {
  CANONICAL_EVENTS,
  canonicalEventSchema,
  CanonicalHookSchema,
} from "./__schemas/hook.schemas";
export type { CanonicalEvent, CanonicalHook } from "./__schemas/hook.schemas";

// Schemas and types — legacy
export {
  HookDefinitionSchema,
  NO_MATCHER_SENTINEL,
} from "./__schemas/hook.schemas";
export type { HookDefinition } from "./__schemas/hook.schemas";

// Registry — canonical and legacy
export {
  canonicalHookRegistry,
  resolveCanonicalRegistry,
  hookRegistry,
  resolveHookRegistry,
} from "./__helpers/hook-registry";

// Platform adapters
export { canonicalToLegacy } from "./__helpers/platform-adapters";
export type { PlatformHookConfig } from "./__helpers/platform-adapters";

// Portable hook abstraction
export {
  SUPPORTED_PLATFORMS,
  supportedPlatformSchema,
  PortableHookConfigSchema,
  createPortableHook,
  detectPlatform,
} from "./__helpers/portable-hook";
export type {
  SupportedPlatform,
  PortableHookConfig,
  PortableHookResult,
} from "./__helpers/portable-hook";

// Config generators — canonical
export { generateClaudeHooksConfigFromCanonical } from "./__helpers/config-generators";

// Adapter registry — formal adapter-registry architecture
export {
  ADAPTER_PLATFORMS,
  adapterPlatformSchema,
  claudeAdapter,
  hookAdapterRegistry,
  resolveAdapter,
  getRegisteredPlatforms,
  generateConfigForPlatform,
} from "./adapters";
export type { AdapterPlatform, HookPlatformAdapter } from "./adapters";
