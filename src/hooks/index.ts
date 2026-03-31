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
  VAULT_GUARD_PROMPT,
} from "./__helpers/hook-registry";

// Platform adapters
export { canonicalToLegacy } from "./__helpers/platform-adapters";
export type { PlatformHookConfig } from "./__schemas/hook.schemas";

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

// Adapter schemas
export {
  ADAPTER_PLATFORMS,
  adapterPlatformSchema,
} from "./__schemas/adapter.schemas";
export type {
  AdapterPlatform,
  HookPlatformAdapter,
} from "./__schemas/adapter.schemas";

// Claude Code adapter
export { claudeAdapter } from "./__helpers/claude-adapter";

// Adapter registry
export {
  hookAdapterRegistry,
  resolveAdapter,
  getRegisteredPlatforms,
  generateConfigForPlatform,
} from "./__helpers/adapter-registry";

// Shell wrapper generator (build-time utility, consumed by scripts/build-shared.ts)
export {
  generateShellWrapper,
  generateAllShellWrappers,
} from "./__helpers/generate-shell-wrappers";
