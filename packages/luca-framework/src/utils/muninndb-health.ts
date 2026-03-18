import { join } from "pathe";

import { getLucaHomePaths } from "./luca-home";
import {
  MuninndbBinaryStatusSchema,
  MuninndbServiceStatusSchema,
  MUNINNDB_BINARY_NAME,
  resolveMuninndbPort,
} from "./muninndb-schemas";

import type {
  MuninndbBinaryStatus,
  MuninndbServiceStatus,
} from "./muninndb-schemas";

/**
 * Check whether the MuninnDB binary is installed and executable.
 *
 * Looks for the binary at `~/.luca/bin/muninndb` (or a custom path).
 * Uses `Bun.file().exists()` to check existence and `Bun.$` to verify
 * executable permissions. Attempts to read the version by running
 * `muninndb --version`.
 *
 * @param binaryPath - Override the default binary path for testing.
 * @returns A validated `MuninndbBinaryStatus` object.
 *
 * @example
 * ```typescript
 * const status = await checkMuninndbBinary();
 * if (!status.installed) {
 *   console.log('MuninnDB not installed — run luca init');
 * }
 * ```
 */
export async function checkMuninndbBinary(
  binaryPath?: string,
): Promise<MuninndbBinaryStatus> {
  const preferredPath = join(getLucaHomePaths().bin, MUNINNDB_BINARY_NAME);
  let resolvedPath = binaryPath ?? preferredPath;

  // Check preferred location first, then fall back to common locations
  const exists = await Bun.file(resolvedPath).exists();
  if (!exists) {
    // Search common install locations before reporting "not found"
    const home = process.env.HOME;
    const candidates = [
      ...(home
        ? [
            join(home, ".local", "bin", MUNINNDB_BINARY_NAME),
            join(home, "bin", MUNINNDB_BINARY_NAME),
            join(home, ".muninndb", "bin", MUNINNDB_BINARY_NAME),
            join(home, ".muninn", "bin", MUNINNDB_BINARY_NAME),
          ]
        : []),
      join("/usr", "local", "bin", MUNINNDB_BINARY_NAME),
    ];

    let found = false;
    for (const candidate of candidates) {
      if (await Bun.file(candidate).exists()) {
        resolvedPath = candidate;
        found = true;
        break;
      }
    }

    // Fallback: Bun.which()
    if (!found) {
      const whichResult = Bun.which(MUNINNDB_BINARY_NAME);
      if (whichResult && (await Bun.file(whichResult).exists())) {
        resolvedPath = whichResult;
        found = true;
      }
    }

    if (!found) {
      return MuninndbBinaryStatusSchema.parse({
        installed: false,
        path: null,
        version: null,
        executable: false,
      });
    }
  }

  // Check executable permission
  let executable = false;
  try {
    const result = await Bun.$`test -x ${resolvedPath}`.quiet().nothrow();
    executable = result.exitCode === 0;
  } catch {
    executable = false;
  }

  // Try to get version
  let version: string | null = null;
  try {
    const result = await Bun.$`${resolvedPath} --version`.quiet().nothrow();
    if (result.exitCode === 0) {
      version = result.stdout.toString().trim() || null;
    }
  } catch {
    // Binary exists but can't report version — acceptable
  }

  return MuninndbBinaryStatusSchema.parse({
    installed: true,
    path: resolvedPath,
    version,
    executable,
  });
}

/**
 * Check whether the MuninnDB service is running and healthy.
 *
 * Sends a GET request to `http://localhost:{port}/health` and checks
 * for a successful response. Also reads the PID from `~/.luca/muninndb.pid`
 * if it exists.
 *
 * @param port - Port to check (default: 8476, or `MUNINNDB_PORT` env var).
 * @returns A validated `MuninndbServiceStatus` object.
 *
 * @example
 * ```typescript
 * const status = await checkMuninndbService();
 * if (status.healthy) {
 *   console.log(`MuninnDB running on port ${status.port} (PID ${status.pid})`);
 * }
 * ```
 */
export async function checkMuninndbService(
  port?: number,
): Promise<MuninndbServiceStatus> {
  const resolvedPort = resolveMuninndbPort(port);

  // Read PID from pidfile
  let pid: number | null = null;
  try {
    const pidfilePath = join(getLucaHomePaths().root, "muninndb.pid");
    const pidfileExists = await Bun.file(pidfilePath).exists();
    if (pidfileExists) {
      const pidStr = await Bun.file(pidfilePath).text();
      const parsed = parseInt(pidStr.trim(), 10);
      if (!isNaN(parsed) && parsed > 0) {
        pid = parsed;
      }
    }
  } catch {
    // Pidfile read failure is non-fatal
  }

  // Check HTTP health endpoint
  let healthy = false;
  let running = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://localhost:${resolvedPort}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    healthy = response.ok;
    running = true;
  } catch {
    // Connection refused or timeout — service not running
    healthy = false;
    running = false;
  }

  return MuninndbServiceStatusSchema.parse({
    running,
    port: resolvedPort,
    pid,
    healthy,
  });
}

/**
 * Options for `waitForMuninndbHealthy()`.
 */
export interface WaitForHealthyOptions {
  /** Port to check (default: 8476). */
  port?: number;
  /** Maximum time to wait in milliseconds (default: 10000). */
  timeoutMs?: number;
  /** Polling interval in milliseconds (default: 500). */
  intervalMs?: number;
}

/**
 * Poll `checkMuninndbService()` until the service reports healthy or timeout.
 *
 * Useful after starting the MuninnDB process to wait for it to become
 * ready before proceeding with operations that depend on it.
 *
 * @param options - Polling options: port, timeout, interval.
 * @returns The final `MuninndbServiceStatus` after the service becomes healthy or timeout expires.
 *
 * @example
 * ```typescript
 * const status = await waitForMuninndbHealthy({ timeoutMs: 15000 });
 * if (!status.healthy) {
 *   console.error('MuninnDB failed to start within 15 seconds');
 * }
 * ```
 */
export async function waitForMuninndbHealthy(
  options: WaitForHealthyOptions = {},
): Promise<MuninndbServiceStatus> {
  const { port, timeoutMs = 10000, intervalMs = 500 } = options;

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const status = await checkMuninndbService(port);
    if (status.healthy) {
      return status;
    }

    // Sleep before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  // Final check after timeout
  return checkMuninndbService(port);
}
