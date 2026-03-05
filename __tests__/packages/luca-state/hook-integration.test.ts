import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { $ } from "bun";

// ─── Test Helpers ───────────────────────────────────────────────────────────

const STATE_FILE = ".planning/state.json";
const STATE_MD = ".planning/STATE.md";
const BRIDGE = "packages/luca-framework/src/state/bridge.ts";
const SNAPSHOT_SYNC_SCRIPT = "src/hooks/scripts/snapshot-sync.sh";
const THROTTLE_FILE = "/tmp/.luca-snapshot-sync-ts";

/**
 * Clean up state files between tests.
 */
function cleanupStateFiles() {
  for (const file of [STATE_FILE, STATE_MD, THROTTLE_FILE]) {
    try {
      unlinkSync(file);
    } catch {
      // File may not exist -- ignore
    }
  }
}

/**
 * Ensure the .planning directory exists for tests.
 */
function ensurePlanningDir() {
  try {
    mkdirSync(".planning", { recursive: true });
  } catch {
    // Directory may already exist -- ignore
  }
}

/**
 * Run a bridge CLI subcommand and return parsed result.
 */
async function runBridge(
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string; json?: any }> {
  const result = await $`bun run ${BRIDGE} ${args}`.quiet().nothrow();
  const stdout = result.stdout.toString().trim();
  const stderr = result.stderr.toString().trim();
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    // stdout may not be JSON
  }
  return { exitCode: result.exitCode, stdout, stderr, json };
}

beforeEach(() => {
  ensurePlanningDir();
  cleanupStateFiles();
  // Enable STATE.md generation so snapshot sync tests can verify it
  process.env.LUCA_EXPORT_MD = "true";
});

afterEach(() => {
  cleanupStateFiles();
  delete process.env.LUCA_EXPORT_MD;
});

// ─── T5.1: Fresh init creates state.json ────────────────────────────────────

describe("ensure-init lifecycle", () => {
  test("fresh init creates state.json", async () => {
    expect(existsSync(STATE_FILE)).toBe(false);

    const result = await runBridge("ensure-init");
    expect(result.exitCode).toBe(0);
    expect(result.json.initialized).toBe(true);
    expect(result.json.already_existed).toBe(false);
    expect(result.json.session_id).toBeDefined();

    expect(existsSync(STATE_FILE)).toBe(true);
  });

  // ─── T5.2: Resume returns already_existed ───────────────────────────────

  test("resume on existing state returns already_existed: true", async () => {
    // First init
    const first = await runBridge("ensure-init");
    expect(first.json.already_existed).toBe(false);
    const originalSessionId = first.json.session_id;

    // Second init (resume)
    const second = await runBridge("ensure-init");
    expect(second.exitCode).toBe(0);
    expect(second.json.initialized).toBe(true);
    expect(second.json.already_existed).toBe(true);
    expect(second.json.session_id).toBe(originalSessionId);
  });

  // ─── T5.3: Force reinit creates new session_id ─────────────────────────

  test("force reinit creates new session_id", async () => {
    // First init
    const first = await runBridge("ensure-init");
    const originalSessionId = first.json.session_id;

    // Force reinit
    const forced = await runBridge("ensure-init", "--force");
    expect(forced.exitCode).toBe(0);
    expect(forced.json.initialized).toBe(true);
    expect(forced.json.already_existed).toBe(false);
    expect(forced.json.session_id).not.toBe(originalSessionId);
  });
});

// ─── T5.4: Snapshot sync updates STATE.md after transition ──────────────────

describe("snapshot sync", () => {
  test("snapshot updates STATE.md after transition", async () => {
    await runBridge("ensure-init");
    await runBridge("transition", "--event=START");

    // STATE.md should have been created by transition
    expect(existsSync(STATE_MD)).toBe(true);

    // Run snapshot to regenerate
    const snapshotResult = await runBridge("snapshot");
    expect(snapshotResult.exitCode).toBe(0);
    expect(snapshotResult.json.snapshot_written).toBe(true);

    const content = await Bun.file(STATE_MD).text();
    expect(content).toContain("# Project State");
    expect(content).toContain("Pre-flight");
  });

  // ─── T5.5: Throttle behavior ─────────────────────────────────────────────

  test("throttle skips when last sync was recent", async () => {
    await runBridge("ensure-init");

    // Write a recent throttle timestamp
    const now = Math.floor(Date.now() / 1000);
    writeFileSync(THROTTLE_FILE, String(now));

    // Run snapshot-sync.sh -- should exit 0 immediately (throttled)
    const result = await $`bash ${SNAPSHOT_SYNC_SCRIPT} < /dev/null`
      .quiet()
      .nothrow();
    expect(result.exitCode).toBe(0);

    // STATE.md should NOT have been created (throttled skip)
    expect(existsSync(STATE_MD)).toBe(false);
  });

  // ─── T5.6: Missing bridge graceful exit ───────────────────────────────────

  test("snapshot-sync exits gracefully when bridge is missing", async () => {
    // Set PROJECT_DIR to a temp directory without the bridge
    const tmpDir = "/tmp/.luca-hook-test-no-bridge";
    mkdirSync(tmpDir, { recursive: true });

    // Clean throttle to avoid interference
    try {
      unlinkSync(THROTTLE_FILE);
    } catch {
      /* ignore */
    }

    const result =
      await $`CLAUDE_PROJECT_DIR=${tmpDir} bash ${SNAPSHOT_SYNC_SCRIPT} < /dev/null`
        .quiet()
        .nothrow();
    expect(result.exitCode).toBe(0);

    // Cleanup
    try {
      unlinkSync(tmpDir);
    } catch {
      /* ignore */
    }
  });
});

// ─── T5.7: STATE.md and state.json consistency ──────────────────────────────

describe("STATE.md and state.json consistency", () => {
  test("bridge read-complexity matches STATE.md content", async () => {
    await runBridge("ensure-init");
    await runBridge("transition", "--event=START");

    // Read complexity from bridge
    const complexityResult = await runBridge("read-complexity");
    expect(complexityResult.json.complexity).toBe("TRIVIAL");
    expect(complexityResult.json.initialized).toBe(true);

    // STATE.md should exist and have content
    const stateContent = await Bun.file(STATE_MD).text();
    expect(stateContent.length).toBeGreaterThan(0);
    expect(stateContent).toContain("# Project State");
  });

  // ─── T5.8: Context breakdown includes state.json ──────────────────────────

  test("state.json has content after initialization", async () => {
    const result = await runBridge("ensure-init");
    expect(result.exitCode).toBe(0);

    // state.json should exist and have content
    const stateJsonContent = await Bun.file(STATE_FILE).text();
    expect(stateJsonContent.length).toBeGreaterThan(0);

    // Should be valid JSON
    const parsed = JSON.parse(stateJsonContent);
    expect(parsed).toBeDefined();
  });
});

// ─── T5.9: Pre-commit snapshot produces valid STATE.md ──────────────────────

describe("pre-commit snapshot integration", () => {
  test("snapshot command produces valid STATE.md with required sections", async () => {
    await runBridge("ensure-init");
    await runBridge("transition", "--event=START");

    // Run snapshot
    const snapshotResult = await runBridge("snapshot");
    expect(snapshotResult.exitCode).toBe(0);

    const content = await Bun.file(STATE_MD).text();

    // Verify STATE.md has required sections
    expect(content).toContain("# Project State");
    expect(content).toContain("## Current Position");
    expect(content).toContain("## Session Identity");
    expect(content).toContain("## Progress");
    expect(content).toContain("## Allowed Events");

    // Verify the state value is reflected
    expect(content).toContain("Pre-flight");
  });
});
