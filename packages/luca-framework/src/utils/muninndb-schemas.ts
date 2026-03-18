import { z } from "zod";

import { checkPlatform } from "./prerequisites";

/**
 * Supported MuninnDB platform targets.
 *
 * These map to the binary asset names published in MuninnDB GitHub releases.
 * Only these four OS+arch combinations are supported.
 */
const SUPPORTED_PLATFORM_TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
] as const;

/**
 * Zod schema for a validated MuninnDB platform target string.
 *
 * Accepts only the four supported targets: darwin-arm64, darwin-x64,
 * linux-x64, linux-arm64.
 */
export const MuninndbPlatformTargetSchema = z.enum(SUPPORTED_PLATFORM_TARGETS);

/** Validated MuninnDB platform target inferred from the Zod schema. */
export type MuninndbPlatformTarget = z.infer<
  typeof MuninndbPlatformTargetSchema
>;

/**
 * Zod schema for MuninnDB binary installation status.
 *
 * Captures whether the binary is installed, its filesystem path,
 * detected version, and whether it has executable permissions.
 */
export const MuninndbBinaryStatusSchema = z.object({
  /** Whether the MuninnDB binary file exists on disk. */
  installed: z.boolean(),
  /** Absolute path to the binary, or null if not found. */
  path: z.string().nullable(),
  /** Version string reported by the binary, or null if unknown. */
  version: z.string().nullable(),
  /** Whether the binary has executable permissions. */
  executable: z.boolean(),
});

/** MuninnDB binary status inferred from the Zod schema. */
export type MuninndbBinaryStatus = z.infer<typeof MuninndbBinaryStatusSchema>;

/**
 * Zod schema for MuninnDB service runtime status.
 *
 * Captures whether the service process is running, the port it listens on,
 * its process ID, and whether it responds to health checks.
 */
export const MuninndbServiceStatusSchema = z.object({
  /** Whether the MuninnDB process appears to be running. */
  running: z.boolean(),
  /** Port number the service listens on. */
  port: z.number(),
  /** Process ID from the pidfile, or null if unavailable. */
  pid: z.number().nullable(),
  /** Whether the service responds to HTTP health checks. */
  healthy: z.boolean(),
});

/** MuninnDB service status inferred from the Zod schema. */
export type MuninndbServiceStatus = z.infer<typeof MuninndbServiceStatusSchema>;

/**
 * Zod schema for a MuninnDB binary download/install result.
 *
 * Returns success/failure with the path to the installed binary
 * or an error message describing what went wrong.
 */
export const MuninndbInstallResultSchema = z.object({
  /** Whether the download and installation succeeded. */
  success: z.boolean(),
  /** Absolute path to the installed binary, or null on failure. */
  binaryPath: z.string().nullable(),
  /** Error message describing the failure, or null on success. */
  error: z.string().nullable(),
});

/** MuninnDB install result inferred from the Zod schema. */
export type MuninndbInstallResult = z.infer<typeof MuninndbInstallResultSchema>;

/**
 * Map for translating process.platform + process.arch into a MuninnDB target.
 *
 * Keys are `{os}-{arch}` strings from Node/Bun process globals.
 * Values are validated MuninnDB platform targets.
 */
const PLATFORM_TARGET_MAP: Record<string, MuninndbPlatformTarget> = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "linux-x64": "linux-x64",
  "linux-arm64": "linux-arm64",
};

/**
 * Resolve the current platform into a validated MuninnDB platform target.
 *
 * Uses `checkPlatform()` from prerequisites.ts to read OS and architecture,
 * then maps the combination to one of the four supported targets. Returns
 * a result object instead of throwing on unsupported platforms.
 *
 * @returns An object with `success`, `target` (on success), and `error` (on failure).
 *
 * @example
 * ```typescript
 * const result = resolvePlatformTarget();
 * if (result.success) {
 *   console.log(result.target); // "darwin-arm64"
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function resolvePlatformTarget():
  | { success: true; target: MuninndbPlatformTarget }
  | { success: false; error: string } {
  const platform = checkPlatform();
  const key = `${platform.os}-${platform.arch}`;
  const target = PLATFORM_TARGET_MAP[key];

  if (!target) {
    return {
      success: false,
      error: `Unsupported platform: ${platform.os}/${platform.arch}. MuninnDB supports: ${SUPPORTED_PLATFORM_TARGETS.join(", ")}`,
    };
  }

  return { success: true, target };
}

/** Default port for MuninnDB service. */
export const MUNINNDB_DEFAULT_PORT = 8476;

/** Default binary name. */
export const MUNINNDB_BINARY_NAME = "muninn";

/**
 * Resolve the MuninnDB port from an explicit value, environment variable, or default.
 *
 * Priority: explicit port > MUNINNDB_PORT env var > MUNINNDB_DEFAULT_PORT (8476).
 *
 * @param port - Explicit port override, or undefined to use env/default.
 * @returns Resolved port number.
 *
 * @example
 * ```typescript
 * const port = resolveMuninndbPort();       // Uses env or 8476
 * const port = resolveMuninndbPort(9000);   // Uses 9000
 * ```
 */
export function resolveMuninndbPort(port?: number): number {
  if (port !== undefined) return port;
  if (process.env.MUNINNDB_PORT) {
    const parsed = parseInt(process.env.MUNINNDB_PORT, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return MUNINNDB_DEFAULT_PORT;
}
