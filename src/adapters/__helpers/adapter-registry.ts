/**
 * Map-based adapter registry with environment auto-detection.
 *
 * Stores registered adapters by name and provides auto-detection
 * from the project's environment. Follows the same functional registry
 * pattern as `plugin-registry.ts` in `src/compilers/__helpers/`.
 *
 * This registry does NOT pre-register any adapters. Registration of
 * built-in adapters happens in `src/adapters/index.ts` (B10) to
 * avoid circular imports.
 */
import type { Adapter } from "../__schemas/adapter.schemas";

/**
 * Internal adapter registry mapping adapter names to Adapter instances.
 * Pre-registration of built-in adapters happens in src/adapters/index.ts.
 */
const registry = new Map<string, Adapter>();

/**
 * Discovery priority order for auto-detection.
 *
 * Each entry maps a directory/file presence check to an adapter name.
 * Checked in order; first match wins.
 */
export const DETECTION_ORDER: ReadonlyArray<{
  path: string;
  adapterName: string;
}> = [
  { path: ".claude", adapterName: "claude" },
  { path: ".cursor", adapterName: "cursor" },
  { path: ".windsurf", adapterName: "windsurf" },
  { path: ".github/agents", adapterName: "vscode" },
];

/**
 * Register an adapter in the global registry.
 *
 * If an adapter with the same name already exists, it is replaced.
 *
 * @param adapter - The adapter to register
 *
 * @example
 * ```typescript
 * registerAdapter(createClaudeAdapter());
 * ```
 */
export function registerAdapter(adapter: Adapter): void {
  registry.set(adapter.config.name, adapter);
}

/**
 * Get a registered adapter by name.
 *
 * @param name - The adapter name (e.g., "claude", "api")
 * @returns The adapter, or undefined if not registered
 */
export function getAdapter(name: string): Adapter | undefined {
  return registry.get(name);
}

/**
 * List all registered adapter instances.
 *
 * @returns Array of all registered Adapter instances
 */
export function listRegisteredAdapters(): Adapter[] {
  return Array.from(registry.values());
}

/**
 * List all registered adapter names.
 *
 * @returns Array of adapter name strings (e.g., ["claude", "api"])
 */
export function listRegisteredAdapterNames(): string[] {
  return Array.from(registry.keys());
}

/**
 * Auto-detect the appropriate adapter from the project environment.
 *
 * Checks for IDE-specific directories in priority order.
 * Falls back to "claude" if no environment is detected.
 *
 * For explicit adapter selection, use CLI flag (--adapter=name) or
 * config file (.planning/config.json adapter field) instead.
 *
 * Discovery priority (highest to lowest):
 * 1. CLI flag: --adapter=name (handled by caller, not this function)
 * 2. Config file: .planning/config.json adapter field (handled by caller)
 * 3. Environment detection: this function
 * 4. Default: "claude"
 *
 * @param projectRoot - Absolute path to the project root directory
 * @returns The detected adapter, or the "claude" adapter as default.
 *          Returns undefined only if the "claude" adapter is not registered.
 */
export function detectAdapter(projectRoot: string): Adapter | undefined {
  // Try each adapter's own detect() method via the priority order.
  // Each adapter's detect() already checks for directory existence,
  // so a separate existsSync fallback loop is unnecessary.
  for (const entry of DETECTION_ORDER) {
    const adapter = registry.get(entry.adapterName);
    if (adapter && adapter.detect(projectRoot)) {
      return adapter;
    }
  }

  // Default to claude
  return registry.get("claude");
}

/**
 * Clear all adapter registrations.
 *
 * After calling this, no adapters are registered. Callers must
 * re-register any needed adapters. Used primarily for testing.
 */
export function resetAdapterRegistry(): void {
  registry.clear();
}
