import * as p from "@clack/prompts";
import { createHash } from "crypto";
import { unlinkSync } from "node:fs";
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
 * GitHub repository slug for MuninnDB releases.
 *
 * Override via `MUNINNDB_REPO_SLUG` environment variable if the repository
 * has moved or you want to point at a fork.
 */
const MUNINNDB_REPO_SLUG =
  process.env.MUNINNDB_REPO_SLUG ?? "nicholasgasior/muninn";

/**
 * Module-level cache for the resolved latest release tag.
 *
 * Once resolved, the tag is cached for the lifetime of the process
 * to avoid repeated GitHub API calls.
 */
let cachedLatestTag: string | null = null;

/**
 * Resolve the `"latest"` MuninnDB version to an actual GitHub release tag.
 *
 * Queries the GitHub Releases API for the latest release of the given
 * repository and returns the `tag_name` (e.g. `"v0.5.0"`). The result
 * is cached at module scope so subsequent calls within the same process
 * return instantly without a network round-trip.
 *
 * On any failure (network error, rate limit, 404, malformed response),
 * returns `null` so the caller can fall back to the redirect-based
 * download URL pattern.
 *
 * @param repoSlug - GitHub `owner/repo` path (e.g. `"nicholasgasior/muninn"`).
 * @returns The release tag string (e.g. `"v0.5.0"`), or `null` on failure.
 *
 * @example
 * ```typescript
 * const tag = await resolveLatestReleaseTag("nicholasgasior/muninn");
 * if (tag) {
 *   console.log(`Latest release: ${tag}`); // "v0.5.0"
 * } else {
 *   console.log("Could not resolve latest tag, using fallback URL");
 * }
 * ```
 */
async function resolveLatestReleaseTag(
  repoSlug: string,
): Promise<string | null> {
  if (cachedLatestTag) {
    return cachedLatestTag;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoSlug}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { tag_name?: string };
    const tagName = data.tag_name;

    if (!tagName || typeof tagName !== "string") {
      return null;
    }

    cachedLatestTag = tagName;
    return tagName;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

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
 * const result = validateDownloadUrl("https://github.com/releases/v1/binary");
 * // { valid: true }
 *
 * const bad = validateDownloadUrl("http://evil.com/binary");
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
 * Build the download URL for a MuninnDB binary release asset.
 *
 * Constructs a URL of the form:
 * `{base}/{version}/muninndb-{target}`
 *
 * **Important:** This function is synchronous and cannot resolve the
 * `"latest"` version to an actual tag. Callers should resolve `"latest"`
 * via {@link resolveLatestReleaseTag} before calling this function.
 * Passing `"latest"` directly will produce a URL with `/download/latest/`
 * which is not a valid GitHub release URL pattern.
 *
 * The base URL can be overridden via `MUNINNDB_DOWNLOAD_BASE` env var.
 * When overridden, the constructed URL is validated to use HTTPS.
 * Throws if the resulting URL uses a non-HTTPS scheme or is malformed.
 *
 * @param target - Validated platform target (e.g. "darwin-arm64").
 * @param version - Release version tag (e.g. "v0.5.0"). Should be a
 *   concrete tag, not `"latest"`.
 * @returns The fully-qualified download URL.
 * @throws {Error} If the resolved URL does not use HTTPS.
 *
 * @see resolveLatestReleaseTag — resolves `"latest"` to a concrete tag
 *   via the GitHub API before calling this function.
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
  const url = `${MUNINNDB_DOWNLOAD_BASE}/${version}/${MUNINNDB_BINARY_NAME}-${target}`;

  const validation = validateDownloadUrl(url);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  return url;
}

/**
 * Options for `downloadMuninndbBinary()`.
 */
export interface DownloadMuninndbOptions {
  /** Release version tag to download (default: env var or "latest"). */
  version?: string;
  /** Whether to show a @clack/prompts spinner during download. */
  showProgress?: boolean;
  /**
   * Skip SHA-256 checksum verification of the downloaded binary.
   *
   * When `true`, the checksum sidecar file is not fetched and the binary
   * is accepted without verification. Can also be set via the
   * `MUNINNDB_SKIP_CHECKSUM` environment variable.
   *
   * @default false
   */
  skipChecksum?: boolean;
}

/**
 * Fetch the SHA-256 checksum sidecar file for a binary URL.
 *
 * Expects the sidecar at `{binaryUrl}.sha256` in standard `sha256sum`
 * output format: `<hex-digest>  <filename>` (or just the hex digest).
 * Extracts and returns the first whitespace-delimited field as the digest.
 *
 * @param binaryUrl - The URL of the binary whose sidecar to fetch.
 * @returns The expected hex digest string, or `null` if the sidecar is unavailable.
 *
 * @example
 * ```typescript
 * const digest = await fetchChecksumSidecar("https://example.com/muninndb-darwin-arm64");
 * // "a1b2c3..." or null
 * ```
 */
export async function fetchChecksumSidecar(
  binaryUrl: string,
): Promise<string | null> {
  const sidecarUrl = `${binaryUrl}.sha256`;

  try {
    const response = await fetch(sidecarUrl);
    if (!response.ok) {
      return null;
    }

    const text = (await response.text()).trim();
    // sha256sum format: "<hex>  <filename>" -- extract first field
    const digest = text.split(/\s+/)[0];
    if (!digest || !/^[a-fA-F0-9]{64}$/.test(digest)) {
      return null;
    }

    return digest.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Verify the SHA-256 checksum of a binary file on disk.
 *
 * Reads the file using `Bun.file()`, computes its SHA-256 hash via
 * `crypto.createHash()`, and compares the hex digest against the expected value.
 *
 * @param binaryPath - Absolute path to the binary file to verify.
 * @param expectedHash - The expected lowercase hex SHA-256 digest.
 * @returns `true` if the computed hash matches the expected hash.
 *
 * @example
 * ```typescript
 * const valid = await verifyBinaryChecksum("/path/to/muninndb", "a1b2c3...");
 * if (!valid) console.error("Checksum mismatch!");
 * ```
 */
export async function verifyBinaryChecksum(
  binaryPath: string,
  expectedHash: string,
): Promise<boolean> {
  const file = Bun.file(binaryPath);
  const buffer = await file.arrayBuffer();
  const computed = createHash("sha256")
    .update(Buffer.from(buffer))
    .digest("hex");
  return computed === expectedHash.toLowerCase();
}

/**
 * Download the MuninnDB binary for the current platform.
 *
 * Resolves the platform target, constructs the download URL (with HTTPS
 * validation), fetches the binary via `fetch()`, writes it to
 * `{targetDir}/muninndb` via `Bun.write()`, and sets executable permissions
 * (0o755) via `Bun.$`.
 *
 * After downloading, verifies the binary against a SHA-256 sidecar file
 * (`{url}.sha256`). On checksum mismatch the binary is deleted and a
 * failure result is returned. If the sidecar is unavailable, the download
 * fails unless `skipChecksum` is set (option or `MUNINNDB_SKIP_CHECKSUM`
 * env var).
 *
 * All errors are caught and returned in the result object -- this function
 * never throws.
 *
 * @param targetDir - Directory to write the binary to (default: `~/.luca/bin/`).
 * @param options - Download options (version, progress display, skipChecksum).
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
  const skipChecksum =
    options.skipChecksum ?? process.env.MUNINNDB_SKIP_CHECKSUM === "1";

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

  // Resolve effective version: when "latest", try API tag resolution first
  const requestedVersion = version ?? MUNINNDB_DEFAULT_VERSION;
  let effectiveVersion = requestedVersion;
  let usingRedirectFallback = false;

  if (requestedVersion === "latest") {
    const resolvedTag = await resolveLatestReleaseTag(MUNINNDB_REPO_SLUG);
    if (resolvedTag) {
      effectiveVersion = resolvedTag;
    } else {
      // API resolution failed — will use redirect-based URL pattern below
      usingRedirectFallback = true;
    }
  }

  // Build and validate URL (catches non-HTTPS schemes from env override)
  let url: string;
  try {
    if (usingRedirectFallback) {
      // GitHub supports: /releases/latest/download/{asset}
      // Our base ends with /releases/download, so swap to the redirect pattern
      const redirectBase = MUNINNDB_DOWNLOAD_BASE.replace(
        "/releases/download",
        "/releases/latest/download",
      );
      url = `${redirectBase}/${MUNINNDB_BINARY_NAME}-${platformResult.target}`;

      const validation = validateDownloadUrl(url);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    } else {
      url = buildDownloadUrl(platformResult.target, effectiveVersion);
    }
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Invalid download URL";
    return MuninndbInstallResultSchema.parse({
      success: false,
      binaryPath: null,
      error: errorMsg,
    });
  }

  // When using the redirect fallback, skip checksum since the sidecar
  // may not be available at the redirect location
  const effectiveSkipChecksum = skipChecksum || usingRedirectFallback;

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

    // --- Binary file-size verification (REQ-02) ---
    const downloadedFile = Bun.file(binaryPath);
    const fileSize = downloadedFile.size;
    if (fileSize === 0) {
      spinner?.stop("Download failed: binary is empty (0 bytes)");
      try {
        unlinkSync(binaryPath);
      } catch {
        // Best-effort cleanup
      }
      return MuninndbInstallResultSchema.parse({
        success: false,
        binaryPath: null,
        error:
          "Downloaded binary is empty (0 bytes). The release asset may be " +
          "missing or the download was interrupted.",
      });
    }

    // --- Checksum verification (SEC-001) ---
    if (!effectiveSkipChecksum) {
      spinner?.message("Verifying checksum...");

      const expectedHash = await fetchChecksumSidecar(url);

      if (!expectedHash) {
        // Sidecar unavailable -- fail unless explicitly skipped
        spinner?.stop(
          "Checksum verification failed: sidecar file not available",
        );
        try {
          unlinkSync(binaryPath);
        } catch {
          // Best-effort cleanup
        }
        return MuninndbInstallResultSchema.parse({
          success: false,
          binaryPath: null,
          error:
            "Checksum sidecar (.sha256) not available for this release. " +
            "Set MUNINNDB_SKIP_CHECKSUM=1 to bypass verification.",
        });
      }

      const checksumValid = await verifyBinaryChecksum(
        binaryPath,
        expectedHash,
      );

      if (!checksumValid) {
        // Mismatch -- delete the binary and fail
        try {
          unlinkSync(binaryPath);
        } catch {
          // Best-effort cleanup
        }
        spinner?.stop("Checksum verification failed: hash mismatch");
        return MuninndbInstallResultSchema.parse({
          success: false,
          binaryPath: null,
          error:
            "SHA-256 checksum mismatch. The downloaded binary does not match " +
            "the expected hash. The file has been deleted for safety.",
        });
      }
    }

    spinner?.stop("MuninnDB downloaded and verified successfully");

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
