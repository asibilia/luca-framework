/**
 * Portable hook abstraction layer.
 *
 * Provides a unified API for creating hooks that work across all supported
 * platforms (Claude Code, Cursor, Pi). Users define a hook once using a
 * PortableHookConfig, and the system generates platform-specific configs
 * for each target platform.
 *
 * Source: src/hooks/__helpers/portable-hook.ts
 */

import { z } from "zod";
import { CanonicalHookSchema } from "../__schemas/hook.schemas";
import type { CanonicalHook, CanonicalEvent } from "../__schemas/hook.schemas";
import type { PlatformHookConfig } from "./platform-adapters";
import {
  adaptForClaude,
  adaptForCursor,
  adaptForPi,
} from "./platform-adapters";

// ---- Supported platforms ----

export const SUPPORTED_PLATFORMS = ["claude-code", "cursor", "pi"] as const;

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
  platforms: z
    .array(supportedPlatformSchema)
    .default(["claude-code", "cursor", "pi"]),
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
 * Checks environment variables and file system indicators set by each
 * platform at runtime.
 *
 * @returns The detected platform, or undefined if no platform is detected
 */
export function detectPlatform(): SupportedPlatform | undefined {
  // Claude Code sets CLAUDE_CODE or CLAUDE_PROJECT_DIR
  if (process.env.CLAUDE_CODE === "1" || process.env.CLAUDE_PROJECT_DIR) {
    return "claude-code";
  }

  // Cursor sets CURSOR or CURSOR_SESSION_ID
  if (process.env.CURSOR === "1" || process.env.CURSOR_SESSION_ID) {
    return "cursor";
  }

  // Pi sets PI_AGENT or PI_SESSION_ID
  if (process.env.PI_AGENT === "1" || process.env.PI_SESSION_ID) {
    return "pi";
  }

  return undefined;
}

// ---- Core factory ----

const PLATFORM_ADAPTERS: Record<
  SupportedPlatform,
  (hook: CanonicalHook) => PlatformHookConfig
> = {
  "claude-code": adaptForClaude,
  cursor: adaptForCursor,
  pi: adaptForPi,
};

/**
 * Create a portable hook from a unified config.
 *
 * Validates the config, builds the canonical hook definition, and generates
 * platform-specific configs for each requested platform.
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
 * // result.platforms.cursor — PlatformHookConfig for Cursor
 * // result.platforms.pi — PlatformHookConfig for Pi
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
    platforms[platform] = PLATFORM_ADAPTERS[platform](canonical);
  }

  return {
    name: validated.name,
    canonical,
    platforms,
  };
}
