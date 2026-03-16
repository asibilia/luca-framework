import { z } from "zod";
import * as p from "@clack/prompts";
import semver from "semver";
import { homedir } from "node:os";

/**
 * Minimum required Bun version for the Luca framework.
 *
 * Luca uses Bun-specific APIs (Bun.file, Bun.write, Bun.version, Bun.spawn)
 * that require at least Bun 1.0.0.
 */
const MIN_BUN_VERSION = "1.0.0";

/**
 * Zod schema for the Bun prerequisite check result.
 *
 * Captures whether Bun is installed, its version, binary path,
 * and whether it meets the minimum version requirement.
 */
export const BunPrerequisiteSchema = z.object({
  /** Whether the Bun runtime is detected in the current environment. */
  installed: z.boolean(),
  /** Bun version string (e.g. "1.1.38"), or null if not installed. */
  version: z.string().nullable(),
  /** Absolute path to the Bun binary, or null if not found. */
  path: z.string().nullable(),
  /** Whether the installed version meets the minimum requirement. */
  meetsMinimum: z.boolean(),
});

/** Bun prerequisite check result inferred from the Zod schema. */
export type BunPrerequisite = z.infer<typeof BunPrerequisiteSchema>;

/**
 * Zod schema for platform information.
 *
 * Captures the operating system, architecture, and home directory
 * of the current runtime environment.
 */
export const PlatformInfoSchema = z.object({
  /** Operating system identifier (e.g. "darwin", "linux", "win32"). */
  os: z.string(),
  /** CPU architecture (e.g. "arm64", "x64"). */
  arch: z.string(),
  /** Absolute path to the user's home directory. */
  homeDir: z.string(),
});

/** Platform information inferred from the Zod schema. */
export type PlatformInfo = z.infer<typeof PlatformInfoSchema>;

/**
 * Zod schema for the combined prerequisite check result.
 *
 * Aggregates Bun runtime and platform checks into a single result
 * with an overall pass/fail status.
 */
export const PrerequisiteResultSchema = z.object({
  /** Whether all prerequisite checks passed. */
  ok: z.boolean(),
  /** Bun runtime check result. */
  bun: BunPrerequisiteSchema,
  /** Platform information. */
  platform: PlatformInfoSchema,
});

/** Combined prerequisite result inferred from the Zod schema. */
export type PrerequisiteResult = z.infer<typeof PrerequisiteResultSchema>;

/**
 * Check whether the Bun runtime is available and meets the minimum version.
 *
 * Detects the Bun global object, reads `Bun.version` for the version string,
 * and uses `Bun.which("bun")` to locate the binary path. Uses `semver.gte()`
 * to compare against the minimum required version (1.0.0).
 *
 * @returns A validated `BunPrerequisite` object.
 *
 * @example
 * ```typescript
 * const bun = checkBunPrerequisite();
 * if (!bun.installed) {
 *   console.error('Bun is not installed');
 * } else if (!bun.meetsMinimum) {
 *   console.error(`Bun ${bun.version} is too old, need 1.0.0+`);
 * }
 * ```
 */
export function checkBunPrerequisite(): BunPrerequisite {
  const installed = typeof Bun !== "undefined";

  if (!installed) {
    return BunPrerequisiteSchema.parse({
      installed: false,
      version: null,
      path: null,
      meetsMinimum: false,
    });
  }

  const version = Bun.version;
  const bunPath = Bun.which("bun");
  const meetsMinimum = semver.gte(version, MIN_BUN_VERSION);

  return BunPrerequisiteSchema.parse({
    installed: true,
    version,
    path: bunPath,
    meetsMinimum,
  });
}

/**
 * Gather platform information from the current runtime environment.
 *
 * Reads `process.platform` for the OS, `process.arch` for the CPU architecture,
 * and `homedir()` for the user's home directory.
 *
 * @returns A validated `PlatformInfo` object.
 *
 * @example
 * ```typescript
 * const platform = checkPlatform();
 * console.log(`${platform.os}/${platform.arch}`); // "darwin/arm64"
 * ```
 */
export function checkPlatform(): PlatformInfo {
  return PlatformInfoSchema.parse({
    os: process.platform,
    arch: process.arch,
    homeDir: homedir(),
  });
}

/**
 * Run all prerequisite checks and return a combined result.
 *
 * Combines the Bun runtime check and platform check into a single
 * `PrerequisiteResult` with an overall `ok` flag. The result is `ok`
 * when Bun is installed and meets the minimum version.
 *
 * @returns A validated `PrerequisiteResult` object.
 *
 * @example
 * ```typescript
 * const result = checkPrerequisites();
 * if (!result.ok) {
 *   console.error('Prerequisites not met');
 *   await promptBunInstall();
 * }
 * ```
 */
export function checkPrerequisites(): PrerequisiteResult {
  const bun = checkBunPrerequisite();
  const platform = checkPlatform();

  return PrerequisiteResultSchema.parse({
    ok: bun.installed && bun.meetsMinimum,
    bun,
    platform,
  });
}

/**
 * Prompt the user to install Bun when it is not detected or outdated.
 *
 * Displays clear installation instructions using `@clack/prompts` and
 * asks the user whether to continue (e.g. retry after installing) or abort.
 *
 * @returns `true` if the user chose to continue, `false` if they chose to abort.
 *
 * @example
 * ```typescript
 * const result = checkPrerequisites();
 * if (!result.ok) {
 *   const shouldContinue = await promptBunInstall();
 *   if (!shouldContinue) process.exit(1);
 * }
 * ```
 */
export async function promptBunInstall(): Promise<boolean> {
  p.note(
    [
      "Luca requires Bun (https://bun.sh) version 1.0.0 or later.",
      "",
      "Install Bun with:",
      "  curl -fsSL https://bun.sh/install | bash",
      "",
      "Or visit: https://bun.sh/docs/installation",
    ].join("\n"),
    "Bun Not Found",
  );

  const shouldContinue = await p.confirm({
    message: "Continue after installing Bun?",
    initialValue: false,
  });

  if (p.isCancel(shouldContinue)) {
    return false;
  }

  return shouldContinue === true;
}
