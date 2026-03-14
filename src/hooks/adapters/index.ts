/**
 * Public API for the hook platform adapters module.
 *
 * Exports adapter contract schema, Claude Code adapter,
 * and the adapter registry.
 */

// Adapter contract
export type { HookPlatformAdapter } from "../__schemas/adapter.schemas";
export {
  ADAPTER_PLATFORMS,
  adapterPlatformSchema,
} from "../__schemas/adapter.schemas";
export type { AdapterPlatform } from "../__schemas/adapter.schemas";

// Claude Code adapter
export {
  CLAUDE_EVENT_MAP as CLAUDE_ADAPTER_EVENT_MAP,
  adaptForClaude as claudeAdapt,
  claudeAdapter,
} from "../__helpers/claude-adapter";

// Adapter registry
export {
  hookAdapterRegistry,
  resolveAdapter,
  getRegisteredPlatforms,
  generateConfigForPlatform,
} from "../__helpers/adapter-registry";
