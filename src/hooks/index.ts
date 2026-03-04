/**
 * Public API for the hooks module.
 *
 * Exports hook schemas, registry, config generators, and platform adapters.
 */

// Schemas and types — canonical (platform-independent)
export {
  CANONICAL_EVENTS,
  canonicalEventSchema,
  CanonicalHookSchema,
} from "./__schemas/hook.schemas";
export type { CanonicalEvent, CanonicalHook } from "./__schemas/hook.schemas";

// Schemas and types — legacy (platform-specific)
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
export {
  CLAUDE_EVENT_MAP,
  CURSOR_EVENT_MAP,
  PI_EVENT_MAP,
  adaptForClaude,
  adaptForCursor,
  adaptForPi,
  canonicalToLegacy,
} from "./__helpers/platform-adapters";
export type { PlatformHookConfig } from "./__helpers/platform-adapters";

// Config generators
export {
  generateClaudeHooksConfig,
  generateCursorHooksConfig,
  generatePiExtension,
} from "./__helpers/config-generators";
