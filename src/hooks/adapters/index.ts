/**
 * Public API for the hook platform adapters module.
 *
 * Exports adapter contract schema, individual platform adapters,
 * and the adapter registry.
 */

// Adapter contract
export type { HookPlatformAdapter } from "./adapter.schemas";
export { ADAPTER_PLATFORMS, adapterPlatformSchema } from "./adapter.schemas";
export type { AdapterPlatform } from "./adapter.schemas";

// Claude Code adapter
export {
  CLAUDE_EVENT_MAP as CLAUDE_ADAPTER_EVENT_MAP,
  adaptForClaude as claudeAdapt,
  claudeAdapter,
} from "./claude.adapter";

// Cursor adapter
export {
  CURSOR_EVENT_MAP as CURSOR_ADAPTER_EVENT_MAP,
  adaptForCursor as cursorAdapt,
  cursorAdapter,
} from "./cursor.adapter";

// Pi adapter
export {
  PI_EVENT_MAP as PI_ADAPTER_EVENT_MAP,
  adaptForPi as piAdapt,
  piAdapter,
} from "./pi.adapter";

// Adapter registry
export {
  hookAdapterRegistry,
  resolveAdapter,
  getRegisteredPlatforms,
  generateConfigForPlatform,
} from "./adapter-registry";
