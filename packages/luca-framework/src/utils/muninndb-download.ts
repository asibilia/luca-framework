import * as p from "@clack/prompts";
import { join } from "pathe";

import { getLucaHomePaths } from "./luca-home";
import {
  resolvePlatformTarget,
  MuninndbInstallResultSchema,
  MUNINNDB_BINARY_NAME,
} from "./muninndb-schemas";

import type {
  MuninndbInstallResult,
  MuninndbPlatformTarget,
} from "./muninndb-schemas";

/**
 * Base URL for MuninnDB GitHub release assets.
 *
 * Override via `MUNINNDB_DOWNLOAD_BASE` environment variable for testing
 * or pointing at a private mirror. The default points to the official
 * MuninnDB GitHub releases page.
 */
const MUNINNDB_DOWNLOAD_BASE =
  process.env.MUNINNDB_DOWNLOAD_BASE ??
  "https://github.com/nicholasgasior/muninn/releases/download";

/**
 * Default MuninnDB version to download when none is specified.
 *
 * Override via `MUNINNDB_VERSION` environment variable.
 */
const MUNINNDB_DEFAULT_VERSION = process.env.MUNINNDB_VERSION ?? "latest";

/**
 * Resolve the current platform into a validated MuninnDB platform target.
 *
 * Thin wrapper around `resolvePlatformTarget()` that returns either
 * the target string or an error result compatible with `MuninndbInstallResult`.
 *
 * @returns Object with `success` and either `target` or `error`.
 *
 * @example
 * ```typescript
 * const result = resolvePlatformForDownload();
 * if (!result.success) console.error(result.error);
 * ```
 */
export function resolvePlatformForDownload():
  | { success: true; target: MuninndbPlatformTarget }
  | { success: false; error: string } {
  return resolvePlatformTarget();
}

/**
 * Build the download URL for a MuninnDB binary release asset.
 *
 * Constructs a URL of the form:
 * `{base}/{version}/muninndb-{target}`
 *
 * The base URL can be overridden via `MUNINNDB_DOWNLOAD_BASE` env var.
 *
 * @param target - Validated platform target (e.g. "darwin-arm64").
 * @param version - Release version tag (default: env var or "latest").
 * @returns The fully-qualified download URL.
 *
 * @example
 * ```typescript
 * const url = buildDownloadUrl("darwin-arm64", "v0.5.0");
 * // "https://github.com/nicholasgasior/muninn/releases/download/v0.5.0/muninndb-darwin-arm64"
 * ```
 */
export function buildDownloadUrl(
  target: MuninndbPlatformTarget,
  version: string = MUNINNDB_DEFAULT_VERSION,
): string {
  return `${MUNINNDB_DOWNLOAD_BASE}/${version}/${MUNINNDB_BINARY_NAME}-${target}`;
}

/**
 * Options for `downloadMuninndbBinary()`.
 */
export interface DownloadMuninndbOptions {
  /** Release version tag to download (default: env var or "latest"). */
  version?: string;
  /** Whether to show a @clack/prompts spinner during download. */
  showProgress?: boolean;
}

/**
 * Download the MuninnDB binary for the current platform.
 *
 * Resolves the platform target, constructs the download URL, fetches the
 * binary via `fetch()`, writes it to `{targetDir}/muninndb` via `Bun.write()`,
 * and sets executable permissions (0o755) via `Bun.$`.
 *
 * All errors are caught and returned in the result object -- this function
 * never throws.
 *
 * @param targetDir - Directory to write the binary to (default: `~/.luca/bin/`).
 * @param options - Download options (version, progress display).
 * @returns A validated `MuninndbInstallResult` with success/failure details.
 *
 * @example
 * ```typescript
 * const result = await downloadMuninndbBinary();
 * if (result.success) {
 *   console.log(`Installed at: ${result.binaryPath}`);
 * } else {
 *   console.error(`Failed: ${result.error}`);
 * }
 * ```
 */
export async function downloadMuninndbBinary(
  targetDir?: string,
  options: DownloadMuninndbOptions = {},
): Promise<MuninndbInstallResult> {
  const { version, showProgress = true } = options;

  // Resolve platform
  const platformResult = resolvePlatformTarget();
  if (!platformResult.success) {
    return MuninndbInstallResultSchema.parse({
      success: false,
      binaryPath: null,
      error: platformResult.error,
    });
  }

  // Resolve target directory
  const dir = targetDir ?? getLucaHomePaths().bin;
  const binaryPath = join(dir, MUNINNDB_BINARY_NAME);
  const url = buildDownloadUrl(platformResult.target, version);

  const spinner = showProgress ? p.spinner() : null;

  try {
    spinner?.start(`Downloading MuninnDB (${platformResult.target})...`);

    // Fetch binary
    const response = await fetch(url);

    if (!response.ok) {
      const errorMsg = `HTTP ${response.status} from ${url}`;
      spinner?.stop(`Download failed: ${errorMsg}`);
      return MuninndbInstallResultSchema.parse({
        success: false,
        binaryPath: null,
        error: errorMsg,
      });
    }

    // Write binary to disk
    const arrayBuffer = await response.arrayBuffer();
    await Bun.write(binaryPath, arrayBuffer);

    // Set executable permissions
    await Bun.$`chmod 755 ${binaryPath}`.quiet();

    spinner?.stop("MuninnDB downloaded successfully");

    return MuninndbInstallResultSchema.parse({
      success: true,
      binaryPath,
      error: null,
    });
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Unknown download error";
    spinner?.stop(`Download failed: ${errorMsg}`);

    return MuninndbInstallResultSchema.parse({
      success: false,
      binaryPath: null,
      error: errorMsg,
    });
  }
}
