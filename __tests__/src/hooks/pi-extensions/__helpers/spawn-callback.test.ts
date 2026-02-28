/**
 * Unit tests for spawnPiSubprocess onComplete callback.
 *
 * Validates that the callback fires on process close/error with
 * the correct payload, and that callback errors do not crash
 * the process handler.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { tmpdir } from "os";
import { mkdtempSync } from "fs";
import { join } from "path";

import {
  spawnPiSubprocess,
  createSessionDir,
} from "~/hooks/pi-extensions/__helpers/spawn";
import {
  subagentRegistry,
  resetSubagentRegistry,
} from "~/hooks/pi-extensions/__helpers/subagent-registry";

import type { SpawnCompletionInfo } from "~/hooks/pi-extensions/__helpers/spawn";

/** Wait for a subagent state to leave "running" status (or timeout). */
function waitForCompletion(id: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const entry = subagentRegistry.get(id);
      if (!entry || entry.status !== "running") {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(
          new Error(`Subagent ${id} did not complete within ${timeoutMs}ms`),
        );
        return;
      }
      setTimeout(check, 50);
    };
    check();
  });
}

describe("spawnPiSubprocess onComplete callback", () => {
  beforeEach(() => {
    resetSubagentRegistry();
  });

  test("onComplete callback fires on process close with correct fields", async () => {
    let callbackInfo: SpawnCompletionInfo | null = null;

    const sessionDir = createSessionDir("test-callback-close");
    const state = spawnPiSubprocess({
      id: "test-cb-1",
      agentName: "test-agent",
      // Use a command that will fail quickly since "pi" likely isn't installed
      // The spawn will fail with an error event, which also triggers onComplete
      task: "echo hello",
      cwd: process.cwd(),
      sessionDir,
      source: "test",
      onComplete: (info) => {
        callbackInfo = info;
      },
    });

    subagentRegistry.set("test-cb-1", state);

    await waitForCompletion("test-cb-1");

    // Callback should have fired
    expect(callbackInfo).not.toBeNull();
    expect(callbackInfo!.id).toBe("test-cb-1");
    expect(callbackInfo!.agent).toBe("test-agent");
    expect(["completed", "failed"]).toContain(callbackInfo!.status);
    expect(typeof callbackInfo!.elapsed).toBe("number");
    expect(callbackInfo!.elapsed).toBeGreaterThanOrEqual(0);
    expect(typeof callbackInfo!.exitCode).toBe("number");
    expect(typeof callbackInfo!.output).toBe("string");
  });

  test("callback errors do not crash the process handler", async () => {
    const sessionDir = createSessionDir("test-callback-crash");
    const state = spawnPiSubprocess({
      id: "test-cb-2",
      agentName: "test-agent",
      task: "test task",
      cwd: process.cwd(),
      sessionDir,
      source: "test",
      onComplete: () => {
        throw new Error("Intentional callback error for testing");
      },
    });

    subagentRegistry.set("test-cb-2", state);

    // Should not throw even though callback throws
    await waitForCompletion("test-cb-2");

    const entry = subagentRegistry.get("test-cb-2");
    expect(entry).toBeDefined();
    expect(entry!.status).not.toBe("running");
  });

  test("without onComplete, process close works as before (backward compat)", async () => {
    const sessionDir = createSessionDir("test-no-callback");
    const state = spawnPiSubprocess({
      id: "test-cb-3",
      agentName: "test-agent",
      task: "test task",
      cwd: process.cwd(),
      sessionDir,
      source: "test",
      // No onComplete
    });

    subagentRegistry.set("test-cb-3", state);

    await waitForCompletion("test-cb-3");

    const entry = subagentRegistry.get("test-cb-3");
    expect(entry).toBeDefined();
    expect(entry!.status).not.toBe("running");
    expect(typeof entry!.exitCode).toBe("number");
    expect(entry!.completedAt).toBeDefined();
  });

  test("onComplete receives status matching exit code", async () => {
    let callbackInfo: SpawnCompletionInfo | null = null;

    const sessionDir = createSessionDir("test-callback-status");
    const state = spawnPiSubprocess({
      id: "test-cb-4",
      agentName: "status-agent",
      task: "test status mapping",
      cwd: process.cwd(),
      sessionDir,
      source: "test",
      onComplete: (info) => {
        callbackInfo = info;
      },
    });

    subagentRegistry.set("test-cb-4", state);

    await waitForCompletion("test-cb-4");

    // Callback must fire regardless of success or failure
    expect(callbackInfo).not.toBeNull();
    // Status must match exit code: 0 = completed, non-zero = failed
    if (callbackInfo!.exitCode === 0) {
      expect(callbackInfo!.status).toBe("completed");
    } else {
      expect(callbackInfo!.status).toBe("failed");
    }
  });
});
