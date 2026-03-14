/**
 * Adapter contract schema for the Luca hook platform adapter system.
 *
 * Defines the typed contract that each platform adapter must conform to.
 * Adding a new platform requires implementing this contract in a single
 * adapter file, then registering it in the adapter registry.
 *
 * Source: src/hooks/adapters/adapter.schemas.ts
 */

import { z } from "zod";
import type { CanonicalEvent, CanonicalHook } from "../__schemas/hook.schemas";
import type { PlatformHookConfig } from "../__helpers/platform-adapters";

/**
 * Supported platform identifiers.
 *
 * Re-exported from portable-hook.ts for convenience. Each adapter
 * declares which platform it serves via this type.
 */
export const ADAPTER_PLATFORMS = ["claude-code"] as const;
export const adapterPlatformSchema = z.enum(ADAPTER_PLATFORMS);
export type AdapterPlatform = z.infer<typeof adapterPlatformSchema>;

/**
 * Typed contract for a platform hook adapter.
 *
 * Each platform adapter exports an object conforming to this interface.
 * The adapter registry maps platform IDs to these objects, enabling
 * runtime resolution of platform-specific behavior.
 */
export interface HookPlatformAdapter {
  /** Platform identifier (e.g., "claude-code") */
  platform: AdapterPlatform;

  /** Maps canonical event names to platform-specific event names */
  event_map: Record<CanonicalEvent, string>;

  /**
   * Transform a canonical hook definition into a platform-specific config.
   *
   * @param hook - Canonical (platform-independent) hook definition
   * @returns Platform-specific hook configuration
   */
  adapt: (hook: CanonicalHook) => PlatformHookConfig;

  /**
   * Generate a complete platform-specific configuration from a canonical registry.
   *
   * @param registry - Canonical hook registry mapping names to definitions
   * @param options - Platform-specific generation options
   * @returns JSON-serializable configuration object or source code string
   */
  generate_config: (
    registry: Record<string, CanonicalHook>,
    options?: Record<string, unknown>,
  ) => Record<string, unknown> | string;
}
