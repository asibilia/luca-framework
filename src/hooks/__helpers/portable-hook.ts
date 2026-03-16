/**
 * Portable hook abstraction layer.
 *
 * Provides a unified API for creating hooks that work with Claude Code.
 * Users define a hook once using a PortableHookConfig, and the system
 * generates the platform-specific config.
 *
 * Source: src/hooks/__helpers/portable-hook.ts
 */

import { z } from "zod";
import { CanonicalHookSchema } from "../__schemas/hook.schemas";
import type { CanonicalHook } from "../__schemas/hook.schemas";
import type { PlatformHookConfig } from "./platform-adapters";
import { resolveAdapter } from "./adapter-registry";

// ---- Supported platforms ----

export const SUPPORTED_PLATFORMS = ["claude-code"] as const;

export const supportedPlatformSchema = z.enum(SUPPORTED_PLATFORMS);
export type SupportedPlatform = z.infer<typeof supportedPlatformSchema>;

// ---- Portable hook config schema ----

/**
 * Unified hook configuration schema.
 *
 * Users provide a platform-independent config; the system derives
 * platform-specific hooks for each target.
 */
export const PortableHookConfigSchema = z.object({
  /** Human-readable hook name (kebab-case) */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/, "Hook name must be kebab-case"),
  /** Platform-independent lifecycle event trigger */
  event: z.enum([
    "post_tool_use",
    "pre_tool_use",
    "stop",
    "session_end",
    "session_start",
  ]),
  /** Tool name regex filter (undefined = always fire) */
  tool_filter: z.string().optional(),
  /** Command substring filter for pre_tool_use hooks */
  command_filter: z.string().optional(),
  /** Shell script filename (relative to hooks/scripts/) */
  script: z.string(),
  /** Timeout in seconds */
  timeout: z.number().positive().default(30),
  /** Run asynchronously (only supported on Claude Code) */
  async: z.boolean().default(false),
  /** Status message shown while hook runs (only supported on Claude Code) */
  status_message: z.string().optional(),
  /** Platforms to generate configs for (defaults to all) */
  platforms: z.array(supportedPlatformSchema).default(["claude-code"]),
});

export type PortableHookConfig = z.infer<typeof PortableHookConfigSchema>;

// ---- Portable hook result ----

/**
 * Result of creating a portable hook.
 *
 * Contains the canonical (platform-independent) definition plus
 * platform-specific configs for each requested platform.
 */
export interface PortableHookResult {
  /** Hook name */
  name: string;
  /** Canonical (platform-independent) hook definition */
  canonical: CanonicalHook;
  /** Platform-specific configs, keyed by platform name */
  platforms: Partial<Record<SupportedPlatform, PlatformHookConfig>>;
}

// ---- Platform detection ----

/**
 * Detect the current IDE/agent platform.
 *
 * Checks environment variables set by Claude Code at runtime.
 *
 * @returns The detected platform, or undefined if no platform is detected
 */
export function detectPlatform(): SupportedPlatform | undefined {
  // Claude Code sets CLAUDE_CODE or CLAUDE_PROJECT_DIR
  if (process.env.CLAUDE_CODE === "1" || process.env.CLAUDE_PROJECT_DIR) {
    return "claude-code";
  }

  return undefined;
}

// ---- Core factory ----

/**
 * Create a portable hook from a unified config.
 *
 * Validates the config, builds the canonical hook definition, and generates
 * platform-specific configs for each requested platform using the adapter registry.
 *
 * @param config - Portable hook configuration
 * @returns PortableHookResult with canonical + platform-specific configs
 *
 * @example
 * ```typescript
 * const result = createPortableHook({
 *   name: "my-hook",
 *   event: "post_tool_use",
 *   tool_filter: "Edit|Write",
 *   script: "my-hook.sh",
 *   timeout: 10,
 *   async: true,
 *   status_message: "Running my hook...",
 * });
 *
 * // result.canonical — CanonicalHook
 * // result.platforms["claude-code"] — PlatformHookConfig for Claude Code
 * ```
 */
export function createPortableHook(
  config: PortableHookConfig,
): PortableHookResult {
  const validated = PortableHookConfigSchema.parse(config);

  const canonical: CanonicalHook = CanonicalHookSchema.parse({
    event: validated.event,
    tool_filter: validated.tool_filter,
    command_filter: validated.command_filter,
    script: validated.script,
    timeout: validated.timeout,
    async: validated.async,
    status_message: validated.status_message,
  });

  const platforms: Partial<Record<SupportedPlatform, PlatformHookConfig>> = {};
  for (const platform of validated.platforms) {
    platforms[platform] = resolveAdapter(platform).adapt(canonical);
  }

  return {
    name: validated.name,
    canonical,
    platforms,
  };
}
