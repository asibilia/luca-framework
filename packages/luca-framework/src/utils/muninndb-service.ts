import { chmodSync } from "node:fs";
import { join } from "pathe";

import { getLucaHomePaths } from "./luca-home";
import {
  MuninndbServiceStatusSchema,
  MUNINNDB_DEFAULT_PORT,
  MUNINNDB_BINARY_NAME,
} from "./muninndb-schemas";
import {
  checkMuninndbBinary,
  checkMuninndbService,
  waitForMuninndbHealthy,
} from "./muninndb-health";

import type {
  MuninndbBinaryStatus,
  MuninndbServiceStatus,
} from "./muninndb-schemas";

/**
 * Options for `startMuninndb()`.
 */
export interface StartMuninndbOptions {
  /** Port to listen on (default: 8476, or `MUNINNDB_PORT` env var). */
  port?: number;
  /** Data directory for MuninnDB storage (default: `~/.luca/muninndb-data/`). */
  dataDir?: string;
  /** Maximum time to wait for healthy in milliseconds (default: 10000). */
  timeoutMs?: number;
  /** Override the binary path (default: `~/.luca/bin/muninndb`). */
  binaryPath?: string;
}

/**
 * Start the MuninnDB service as a detached background process.
 *
 * Spawns the MuninnDB binary with `Bun.spawn()` in detached mode so it
 * survives parent process exit. Writes the PID to `~/.luca/muninndb.pid`,
 * then waits for the service to become healthy via `waitForMuninndbHealthy()`.
 *
 * If the service is already running and healthy, returns current status
 * without starting a new process.
 *
 * @param options - Start options (port, data directory, timeout, binary path).
 * @returns A validated `MuninndbServiceStatus` object.
 *
 * @example
 * ```typescript
 * const status = await startMuninndb({ port: 8476 });
 * if (status.healthy) {
 *   console.log(`MuninnDB running on port ${status.port}`);
 * }
 * ```
 */
export async function startMuninndb(
  options: StartMuninndbOptions = {},
): Promise<MuninndbServiceStatus> {
  const {
    port: rawPort,
    dataDir: rawDataDir,
    timeoutMs = 10000,
    binaryPath: rawBinaryPath,
  } = options;

  const port =
    rawPort ??
    (process.env.MUNINNDB_PORT
      ? parseInt(process.env.MUNINNDB_PORT, 10)
      : MUNINNDB_DEFAULT_PORT);

  const homePaths = getLucaHomePaths();
  const binaryPath = rawBinaryPath ?? join(homePaths.bin, MUNINNDB_BINARY_NAME);
  const dataDir =
    rawDataDir ??
    process.env.MUNINNDB_DATA_DIR ??
    join(homePaths.root, "muninndb-data");
  const pidfilePath = join(homePaths.root, "muninndb.pid");

  // Check if already running
  const existingStatus = await checkMuninndbService(port);
  if (existingStatus.healthy) {
    return existingStatus;
  }

  // Clean stale pidfile if process is not running
  await cleanStalePidfile(pidfilePath);

  // Ensure data directory exists
  try {
    await Bun.$`mkdir -p ${dataDir}`.quiet();
  } catch {
    // Non-fatal — MuninnDB may create it
  }

  // Spawn detached process
  try {
    const proc = Bun.spawn(
      [binaryPath, "--port", String(port), "--data-dir", dataDir],
      {
        stdout: "ignore",
        stderr: "ignore",
        stdin: "ignore",
      },
    );

    // Write PID to pidfile with restrictive permissions (SEC-004)
    if (proc.pid) {
      await Bun.write(pidfilePath, String(proc.pid));
      chmodSync(pidfilePath, 0o600);
      // Unref so parent can exit
      proc.unref();
    }
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to spawn MuninnDB process";
    return MuninndbServiceStatusSchema.parse({
      running: false,
      port,
      pid: null,
      healthy: false,
    });
  }

  // Wait for healthy
  return waitForMuninndbHealthy({ port, timeoutMs });
}

/**
 * Stop the MuninnDB service by reading the PID from the pidfile.
 *
 * Sends SIGTERM to the process, waits briefly for exit, then cleans up
 * the pidfile. If the pidfile does not exist or the process is not running,
 * returns a success result.
 *
 * @returns A result object with `success` and optional `error`.
 *
 * @example
 * ```typescript
 * const result = await stopMuninndb();
 * if (result.success) {
 *   console.log('MuninnDB stopped');
 * }
 * ```
 */
export async function stopMuninndb(): Promise<{
  success: boolean;
  error: string | null;
}> {
  const pidfilePath = join(getLucaHomePaths().root, "muninndb.pid");

  try {
    const pidfileExists = await Bun.file(pidfilePath).exists();
    if (!pidfileExists) {
      return { success: true, error: null };
    }

    const pidStr = await Bun.file(pidfilePath).text();
    const pid = parseInt(pidStr.trim(), 10);

    if (isNaN(pid) || pid <= 0) {
      // Invalid pidfile — clean it up
      await removePidfile(pidfilePath);
      return { success: true, error: null };
    }

    // Check if process is actually running
    if (!isProcessRunning(pid)) {
      await removePidfile(pidfilePath);
      return { success: true, error: null };
    }

    // Verify the process is actually MuninnDB before sending signal (SEC-004)
    if (!(await verifyProcessIdentity(pid))) {
      console.warn(
        `[muninndb-service] PID ${pid} is not a MuninnDB process. Cleaning stale pidfile.`,
      );
      await removePidfile(pidfilePath);
      return { success: true, error: null };
    }

    // Send SIGTERM
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Process may have already exited
      await removePidfile(pidfilePath);
      return { success: true, error: null };
    }

    // Wait for process to exit (up to 5 seconds)
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && isProcessRunning(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    // Force kill if still running
    if (isProcessRunning(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Ignore — may have exited between check and kill
      }
    }

    await removePidfile(pidfilePath);
    return { success: true, error: null };
  } catch (err) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to stop MuninnDB";
    return { success: false, error: errorMsg };
  }
}

/**
 * Restart the MuninnDB service (stop then start).
 *
 * @param options - Start options passed to `startMuninndb()`.
 * @returns A validated `MuninndbServiceStatus` after restart.
 *
 * @example
 * ```typescript
 * const status = await restartMuninndb();
 * if (status.healthy) {
 *   console.log('MuninnDB restarted successfully');
 * }
 * ```
 */
export async function restartMuninndb(
  options: StartMuninndbOptions = {},
): Promise<MuninndbServiceStatus> {
  await stopMuninndb();
  return startMuninndb(options);
}

/**
 * Get a combined status report for MuninnDB binary and service.
 *
 * Combines `checkMuninndbBinary()` and `checkMuninndbService()` results
 * into a single object for use by doctor checks and status commands.
 *
 * @returns An object with both `binary` and `service` status.
 *
 * @example
 * ```typescript
 * const status = await getMuninndbStatus();
 * if (!status.binary.installed) {
 *   console.log('Binary not found');
 * } else if (!status.service.healthy) {
 *   console.log('Service not running');
 * }
 * ```
 */
export async function getMuninndbStatus(): Promise<{
  binary: MuninndbBinaryStatus;
  service: MuninndbServiceStatus;
}> {
  const [binary, service] = await Promise.all([
    checkMuninndbBinary(),
    checkMuninndbService(),
  ]);

  return { binary, service };
}

/**
 * Check if a process is running by sending signal 0.
 *
 * @param pid - Process ID to check.
 * @returns `true` if the process exists, `false` otherwise.
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove the pidfile if it exists.
 *
 * @param pidfilePath - Absolute path to the pidfile.
 */
async function removePidfile(pidfilePath: string): Promise<void> {
  try {
    await Bun.$`rm -f ${pidfilePath}`.quiet();
  } catch {
    // Non-fatal
  }
}

/**
 * Clean up a stale pidfile (one referencing a process that is no longer running).
 *
 * @param pidfilePath - Absolute path to the pidfile.
 */
async function cleanStalePidfile(pidfilePath: string): Promise<void> {
  try {
    const exists = await Bun.file(pidfilePath).exists();
    if (!exists) return;

    const pidStr = await Bun.file(pidfilePath).text();
    const pid = parseInt(pidStr.trim(), 10);

    if (isNaN(pid) || pid <= 0 || !isProcessRunning(pid)) {
      await removePidfile(pidfilePath);
      return;
    }

    // Process is running but may not be MuninnDB (SEC-004)
    if (!(await verifyProcessIdentity(pid))) {
      console.warn(
        `[muninndb-service] PID ${pid} in pidfile is not a MuninnDB process. Removing stale pidfile.`,
      );
      await removePidfile(pidfilePath);
    }
  } catch {
    // Non-fatal — ignore pidfile issues
  }
}

/**
 * Verify that a given PID belongs to a MuninnDB process.
 *
 * Uses `ps -p <pid> -o comm=` to retrieve the process command name and
 * checks whether it contains "muninndb" (case-insensitive). This prevents
 * sending signals to unrelated processes if the PID file is stale or
 * has been tampered with.
 *
 * @param pid - Process ID to verify.
 * @returns `true` if the process command name contains "muninndb".
 *
 * @example
 * ```typescript
 * if (await verifyProcessIdentity(12345)) {
 *   process.kill(12345, "SIGTERM");
 * }
 * ```
 */
async function verifyProcessIdentity(pid: number): Promise<boolean> {
  try {
    const result = await Bun.$`ps -p ${pid} -o comm=`.quiet();
    const comm = result.text().trim().toLowerCase();
    return comm.includes("muninndb");
  } catch {
    // ps failed — process may not exist or command unavailable
    return false;
  }
}
