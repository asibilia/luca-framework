/**
 * Public API for the hooks module.
 *
 * Exports hook schemas, registry, and config generators.
 */

// Schemas and types
export {
  HookDefinitionSchema,
  NO_MATCHER_SENTINEL,
} from "./__schemas/hook.schemas";
export type { HookDefinition } from "./__schemas/hook.schemas";

// Registry
export { hookRegistry, resolveHookRegistry } from "./__helpers/hook-registry";

// Config generators
export {
  generateClaudeHooksConfig,
  generateCursorHooksConfig,
  generatePiExtension,
} from "./__helpers/config-generators";
