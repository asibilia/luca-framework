import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
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
 * Base URL for the MuninnDB website.
 *
 * Override via `MUNINNDB_DOWNLOAD_BASE` environment variable for testing
 * or pointing at a private mirror. The default points to the official
 * MuninnDB website.
 */
const MUNINNDB_DOWNLOAD_BASE =
  process.env.MUNINNDB_DOWNLOAD_BASE ?? "https://muninndb.com";

/**
 * Trusted hosts for the install script URL.
 *
 * When `MUNINNDB_INSTALL_SCRIPT_URL` is overridden via env var, the URL
 * hostname must match one of these entries. Set `MUNINNDB_ALLOW_UNTRUSTED=1`
 * to bypass this restriction (e.g. for local development servers).
 */
const TRUSTED_INSTALL_HOSTS = new Set(["muninndb.com", "www.muninndb.com"]);

/**
 * URL to the official MuninnDB install script.
 *
 * The install script handles platform detection, downloading the correct
 * binary, and placing it in the appropriate location. Override via
 * `MUNINNDB_INSTALL_SCRIPT_URL` environment variable for testing or
 * pointing at a custom install script.
 *
 * @see https://github.com/scrypster/muninndb
 */
const MUNINNDB_INSTALL_SCRIPT_URL =
  process.env.MUNINNDB_INSTALL_SCRIPT_URL ??
  `${MUNINNDB_DOWNLOAD_BASE}/install.sh`;

/**
 * Validate that a download URL uses the HTTPS scheme.
 *
 * Parses the URL with `new URL()` to verify structure, then checks
 * that the protocol is strictly `https:`. Rejects `http://`, `file://`,
 * and any other non-HTTPS scheme with a descriptive error message.
 *
 * @param url - The fully-qualified URL to validate.
 * @returns Object with `valid` boolean and optional `error` string.
 *
 * @example
 * ```typescript
 * const result = validateDownloadUrl("https://muninndb.com/install.sh");
 * // { valid: true }
 *
 * const bad = validateDownloadUrl("http://evil.com/install.sh");
 * // { valid: false, error: "Download URL must use HTTPS. Got: http:" }
 * ```
 */
export function validateDownloadUrl(
  url: string,
): { valid: true } | { valid: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      valid: false,
      error: `Invalid download URL: "${url}" is not a valid URL.`,
    };
  }

  if (parsed.protocol !== "https:") {
    return {
      valid: false,
      error: `Download URL must use HTTPS. Got: ${parsed.protocol} in "${url}"`,
    };
  }

  return { valid: true };
}

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
 * Options for `downloadMuninndbBinary()`.
 */
export interface DownloadMuninndbOptions {
  /** Whether to show a @clack/prompts spinner during install. */
  showProgress?: boolean;
}

/**
 * Extract a binary path from the install script's stdout.
 *
 * Scans each line for common patterns like "installed to /path/to/muninndb"
 * or lines ending with "/muninndb". Returns the first match, or `null`.
 *
 * @param stdout - Raw stdout from the install script execution.
 * @returns Absolute path to the binary mentioned in output, or `null`.
 */
function extractPathFromOutput(stdout: string): string | null {
  const lines = stdout.split("\n");
  for (const line of lines) {
    // Match patterns like: "Installed to /some/path/muninndb"
    // or "MuninnDB installed: /some/path/muninndb"
    const installMatch = line.match(
      /(?:installed?\s+(?:to|at|in)?|saved?\s+(?:to|at|in)?|binary\s+(?:at|in)?)\s+(\S*muninndb\S*)/i,
    );
    if (installMatch?.[1]) {
      const candidate = installMatch[1].replace(/['"]+/g, "");
      if (candidate.startsWith("/") && existsSync(candidate)) {
        return candidate;
      }
    }

    // Match any absolute path ending with /muninndb on its own
    const pathMatch = line.match(/(\/\S*\/muninndb)(?:\s|$)/);
    if (pathMatch?.[1]) {
      const candidate = pathMatch[1].replace(/['"]+/g, "");
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Locate the installed muninndb binary after the install script runs.
 *
 * Checks the preferred directory first (cheapest check), then parses
 * install script output (if provided), common install locations,
 * `Bun.which()`, and finally a limited `find` search as a last resort.
 *
 * @param preferredDir - The preferred target directory (e.g. `~/.luca/bin/`).
 * @param installStdout - Optional stdout from the install script to parse for paths.
 * @returns Absolute path to the binary, or `null` if not found.
 *
 * @example
 * ```typescript
 * const path = await findInstalledBinary("/home/user/.luca/bin", scriptOutput);
 * if (path) console.log(`Found at: ${path}`);
 * ```
 */
async function findInstalledBinary(
  preferredDir: string,
  installStdout?: string,
): Promise<string | null> {
  // Check preferred location first
  const preferredPath = join(preferredDir, MUNINNDB_BINARY_NAME);
  if (existsSync(preferredPath)) {
    return preferredPath;
  }

  // Try to extract path from install script output
  if (installStdout) {
    const outputPath = extractPathFromOutput(installStdout);
    if (outputPath) {
      return outputPath;
    }
  }

  // Check common install locations (only include HOME-based paths when HOME is defined)
  const home = process.env.HOME;
  const commonPaths = [
    ...(home
      ? [
          join(home, ".local", "bin", MUNINNDB_BINARY_NAME),
          join(home, "bin", MUNINNDB_BINARY_NAME),
          // Tool-specific directories that install scripts commonly use
          join(home, ".muninndb", "bin", MUNINNDB_BINARY_NAME),
          join(home, ".muninndb", MUNINNDB_BINARY_NAME),
          join(home, ".cargo", "bin", MUNINNDB_BINARY_NAME),
        ]
      : []),
    join("/usr", "local", "bin", MUNINNDB_BINARY_NAME),
  ];

  for (const candidate of commonPaths) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback: use Bun.which() to find it on PATH (more portable than shelling out)
  const whichResult = Bun.which(MUNINNDB_BINARY_NAME);
  if (whichResult && existsSync(whichResult)) {
    return whichResult;
  }

  // Last resort: limited find search in HOME directory (maxdepth 4 to keep it fast)
  if (home) {
    try {
      const findResult =
        await Bun.$`find ${home} -maxdepth 4 -name ${MUNINNDB_BINARY_NAME} -type f 2>/dev/null | head -1`
          .nothrow()
          .quiet();
      const foundPath = findResult.stdout.toString().trim();
      if (foundPath && existsSync(foundPath)) {
        return foundPath;
      }
    } catch {
      // find failed — acceptable
    }
  }

  return null;
}

/**
 * Download and install the MuninnDB binary using the official install script.
 *
 * Runs the MuninnDB install script from `https://muninndb.com/install.sh`
 * (or a custom URL via `MUNINNDB_INSTALL_SCRIPT_URL` env var). The install
 * script handles platform detection, binary download, and integrity
 * verification internally.
 *
 * After the script completes, the function locates the installed binary
 * and optionally copies it to `targetDir` if it was installed elsewhere.
 *
 * All errors are caught and returned in the result object -- this function
 * never throws.
 *
 * @param targetDir - Directory to ensure the binary is in (default: `~/.luca/bin/`).
 *   If the install script places the binary elsewhere, it will be copied here.
 * @param options - Install options (progress display).
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
  const { showProgress = true } = options;

  // Validate the install script URL uses HTTPS
  const urlValidation = validateDownloadUrl(MUNINNDB_INSTALL_SCRIPT_URL);
  if (!urlValidation.valid) {
    return MuninndbInstallResultSchema.parse({
      success: false,
      binaryPath: null,
      error: urlValidation.error,
    });
  }

  // Validate the URL hostname is trusted (prevents arbitrary script execution via env override)
  if (process.env.MUNINNDB_ALLOW_UNTRUSTED !== "1") {
    try {
      const parsed = new URL(MUNINNDB_INSTALL_SCRIPT_URL);
      if (!TRUSTED_INSTALL_HOSTS.has(parsed.hostname)) {
        return MuninndbInstallResultSchema.parse({
          success: false,
          binaryPath: null,
          error:
            `Install script URL hostname "${parsed.hostname}" is not in the trusted hosts list. ` +
            `Set MUNINNDB_ALLOW_UNTRUSTED=1 to bypass this check.`,
        });
      }
    } catch {
      // URL parsing already validated above
    }
  }

  // Resolve platform (early check before running install script)
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

  const spinner = showProgress ? p.spinner() : null;

  try {
    spinner?.start(
      `Installing MuninnDB via official install script (${platformResult.target})...`,
    );

    // Download the install script first, then execute it.
    // This avoids the curl|sh pipefail issue where curl failures are masked
    // by the shell's exit code. Download separately so HTTP errors fail fast.
    const curlResult = await Bun.$`curl -sSL -f ${MUNINNDB_INSTALL_SCRIPT_URL}`
      .nothrow()
      .quiet();

    if (curlResult.exitCode !== 0) {
      const stderr = curlResult.stderr.toString().trim();
      const errorMsg = stderr
        ? `Failed to download install script (exit ${curlResult.exitCode}): ${stderr}`
        : `Failed to download install script (exit ${curlResult.exitCode}) from ${MUNINNDB_INSTALL_SCRIPT_URL}`;
      spinner?.stop(`Install failed: ${errorMsg}`);
      return MuninndbInstallResultSchema.parse({
        success: false,
        binaryPath: null,
        error: errorMsg,
      });
    }

    const scriptContent = curlResult.stdout.toString();
    if (!scriptContent.trim()) {
      spinner?.stop("Install failed: downloaded script is empty");
      return MuninndbInstallResultSchema.parse({
        success: false,
        binaryPath: null,
        error: "Downloaded install script is empty.",
      });
    }

    // Execute the downloaded script with env vars to guide install location.
    // Common install scripts honor INSTALL_DIR, BIN_DIR, or PREFIX.
    const installResult =
      await Bun.$`INSTALL_DIR=${dir} BIN_DIR=${dir} PREFIX=${dir} sh -c ${scriptContent}`
        .nothrow()
        .quiet();

    const installStdout = installResult.stdout.toString();
    const installStderr = installResult.stderr.toString().trim();

    if (installResult.exitCode !== 0) {
      const errorMsg = installStderr
        ? `Install script failed (exit ${installResult.exitCode}): ${installStderr}`
        : `Install script failed with exit code ${installResult.exitCode}`;
      spinner?.stop(`Install failed: ${errorMsg}`);
      return MuninndbInstallResultSchema.parse({
        success: false,
        binaryPath: null,
        error: errorMsg,
      });
    }

    // Locate the installed binary (pass stdout for path extraction)
    const foundPath = await findInstalledBinary(dir, installStdout);

    if (!foundPath) {
      // Include script output in error for debugging
      const outputHint = installStdout.trim()
        ? `\nInstall script output:\n${installStdout.trim().slice(0, 500)}`
        : "";
      const stderrHint = installStderr
        ? `\nInstall script stderr:\n${installStderr.slice(0, 300)}`
        : "";
      spinner?.stop("Install script succeeded but binary not found on system");
      return MuninndbInstallResultSchema.parse({
        success: false,
        binaryPath: null,
        error:
          "MuninnDB install script completed successfully but the binary " +
          "could not be found. Check that the install script placed it in " +
          "a standard location (~/.local/bin/, /usr/local/bin/, ~/bin/, " +
          `or ~/.muninndb/bin/).${outputHint}${stderrHint}`,
      });
    }

    // If the binary was installed outside our preferred directory, copy it there
    const preferredPath = join(dir, MUNINNDB_BINARY_NAME);
    if (foundPath !== preferredPath) {
      try {
        const sourceFile = Bun.file(foundPath);
        await Bun.write(preferredPath, sourceFile);
        await Bun.$`chmod 755 ${preferredPath}`.quiet();
      } catch (copyErr) {
        // Binary exists at foundPath but we could not copy it -- still usable
        spinner?.stop(`MuninnDB installed at ${foundPath}`);
        return MuninndbInstallResultSchema.parse({
          success: true,
          binaryPath: foundPath,
          error: null,
        });
      }
    }

    spinner?.stop("MuninnDB installed successfully");

    return MuninndbInstallResultSchema.parse({
      success: true,
      binaryPath: preferredPath,
      error: null,
    });
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Unknown install error";
    spinner?.stop(`Install failed: ${errorMsg}`);

    return MuninndbInstallResultSchema.parse({
      success: false,
      binaryPath: null,
      error: errorMsg,
    });
  }
}
