/**
 * Adapter registry for the Luca hook platform adapter system.
 *
 * Maps platform identifiers to adapter objects, enabling runtime resolution
 * of platform-specific behavior. Adding a new platform requires creating one
 * adapter file and adding one entry to this registry.
 *
 * Source: src/hooks/__helpers/adapter-registry.ts
 */

import type { CanonicalHook } from "../__schemas/hook.schemas";
import type {
  HookPlatformAdapter,
  AdapterPlatform,
} from "../__schemas/adapter.schemas";
import { claudeAdapter } from "./claude-adapter";

// ---- Registry ----

/**
 * Hook adapter registry mapping platform IDs to adapter objects.
 *
 * Each adapter conforms to the HookPlatformAdapter contract defined
 * in adapter.schemas.ts. Claude Code is the sole supported platform.
 */
export const hookAdapterRegistry: Record<AdapterPlatform, HookPlatformAdapter> =
  {
    "claude-code": claudeAdapter,
  };

// ---- Resolution helpers ----

/**
 * Resolve the adapter for a given platform.
 *
 * @param platform - Platform identifier
 * @returns The registered adapter for the platform
 * @throws Error if the platform is not registered
 */
export function resolveAdapter(platform: AdapterPlatform): HookPlatformAdapter {
  const adapter = hookAdapterRegistry[platform];
  if (!adapter) {
    throw new Error(
      `No hook adapter registered for platform "${platform}". ` +
        `Registered platforms: ${getRegisteredPlatforms().join(", ")}`,
    );
  }
  return adapter;
}

/**
 * Get all registered platform identifiers.
 *
 * @returns Array of registered platform IDs
 */
export function getRegisteredPlatforms(): AdapterPlatform[] {
  return Object.keys(hookAdapterRegistry) as AdapterPlatform[];
}

/**
 * Generate platform-specific configuration from a canonical hook registry.
 *
 * Resolves the adapter for the given platform and delegates to its
 * generate_config function.
 *
 * @param platform - Target platform identifier
 * @param registry - Canonical hook registry mapping names to definitions
 * @param options - Platform-specific generation options
 * @returns JSON-serializable configuration object or source code string
 */
export function generateConfigForPlatform(
  platform: AdapterPlatform,
  registry: Record<string, CanonicalHook>,
  options?: Record<string, unknown>,
): Record<string, unknown> | string {
  const adapter = resolveAdapter(platform);
  return adapter.generate_config(registry, options);
}
