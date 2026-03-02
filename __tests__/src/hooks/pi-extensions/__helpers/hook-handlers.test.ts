/**
 * Tests for Pi-native hook handler functions.
 *
 * Tests each handler with controlled filesystem state. Uses real
 * filesystem for file-based checks, and validates return values.
 */
import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import {
  handlePostEditFormat,
  handlePostEditTypecheck,
  handlePreCommitGate,
  handleContextCheckThrottled,
  handleSessionPersist,
  handleSessionStart,
  handleContextMonitor,
} from "~/hooks/pi-extensions/__helpers/hook-handlers";
import { resetAllThrottles } from "~/hooks/pi-extensions/__helpers/throttle";
import type { PiExtensionContext } from "~/hooks/pi-extensions/__types/pi-context";

const tmpDir = join(import.meta.dir, ".tmp-hook-handlers");

function setupTmp(): string {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(join(tmpDir, ".planning"), { recursive: true });
  mkdirSync(join(tmpDir, ".claude"), { recursive: true });
  return tmpDir;
}

beforeEach(() => {
  resetAllThrottles();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─── handlePostEditFormat ─────────────────────────────────────────────────

describe("handlePostEditFormat", () => {
  test("skips non-formattable extensions", () => {
    const cwd = setupTmp();
    // Should not throw for unformattable file types
    handlePostEditFormat("/some/file.bin", cwd);
    handlePostEditFormat("/some/file.png", cwd);
    handlePostEditFormat("/some/file.exe", cwd);
  });

  test("skips empty file path", () => {
    const cwd = setupTmp();
    handlePostEditFormat("", cwd);
  });

  test("attempts formatting for .ts files", () => {
    const cwd = setupTmp();
    // This will fail (no prettier installed at tmpDir) but should not throw
    handlePostEditFormat("/some/file.ts", cwd);
  });
});

// ─── handlePostEditTypecheck ──────────────────────────────────────────────

describe("handlePostEditTypecheck", () => {
  test("skips non-TypeScript files", () => {
    const cwd = setupTmp();
    expect(handlePostEditTypecheck("/some/file.js", cwd)).toBeUndefined();
    expect(handlePostEditTypecheck("/some/file.css", cwd)).toBeUndefined();
  });

  test("skips empty file path", () => {
    const cwd = setupTmp();
    expect(handlePostEditTypecheck("", cwd)).toBeUndefined();
  });

  test("skips when tsconfig.json is missing", () => {
    const cwd = setupTmp();
    expect(handlePostEditTypecheck("/some/file.ts", cwd)).toBeUndefined();
  });
});

// ─── handlePreCommitGate ──────────────────────────────────────────────────

describe("handlePreCommitGate", () => {
  test("skips non-commit commands", () => {
    const cwd = setupTmp();
    expect(handlePreCommitGate("git status", cwd)).toBeUndefined();
    expect(handlePreCommitGate("git push", cwd)).toBeUndefined();
    expect(handlePreCommitGate("ls -la", cwd)).toBeUndefined();
  });

  test("skips empty command", () => {
    const cwd = setupTmp();
    expect(handlePreCommitGate("", cwd)).toBeUndefined();
  });

  test("returns block response when tests fail on commit", () => {
    const cwd = setupTmp();
    // Create config to ensure bun runtime detection
    writeFileSync(
      join(cwd, ".planning", "config.json"),
      JSON.stringify({ runtime: "bun" }),
      "utf-8",
    );

    // Tests will fail since there are no test files in tmpDir
    const result = handlePreCommitGate("git commit -m 'test'", cwd);
    expect(result).toBeDefined();
    expect(result?.block).toBe(true);
    expect(result?.reason).toContain("pre-commit-gate");
  });
});

// ─── handleContextCheckThrottled ──────────────────────────────────────────

describe("handleContextCheckThrottled", () => {
  test("uses ctx.getContextUsage() when available", () => {
    const cwd = setupTmp();
    const ctx: PiExtensionContext = {
      getContextUsage: () => ({
        tokens: 150_000,
        contextWindow: 200_000, percent: null,
      }),
    };

    const msg = handleContextCheckThrottled(cwd, ctx);
    expect(msg).toBeDefined();
    expect(msg).toContain("Context Monitor");
    expect(msg).toContain("75%");
  });

  test("returns void for low context usage", () => {
    const cwd = setupTmp();
    const ctx: PiExtensionContext = {
      getContextUsage: () => ({
        tokens: 10_000,
        contextWindow: 200_000, percent: null,
      }),
    };

    const msg = handleContextCheckThrottled(cwd, ctx);
    expect(msg).toBeUndefined();
  });

  test("respects throttle interval", () => {
    const cwd = setupTmp();
    const ctx: PiExtensionContext = {
      getContextUsage: () => ({
        tokens: 150_000,
        contextWindow: 200_000, percent: null,
      }),
    };

    // First call runs
    const first = handleContextCheckThrottled(cwd, ctx);
    expect(first).toBeDefined();

    // Second call within throttle window is suppressed
    const second = handleContextCheckThrottled(cwd, ctx);
    expect(second).toBeUndefined();
  });

  test("falls back to WORKING.md size when ctx unavailable", () => {
    const cwd = setupTmp();
    // Create a large WORKING.md (> 60KB)
    const largeContent = "x".repeat(65_000);
    writeFileSync(join(cwd, ".planning", "WORKING.md"), largeContent, "utf-8");

    const msg = handleContextCheckThrottled(cwd);
    expect(msg).toBeDefined();
    expect(msg).toContain("CRITICAL");
    expect(msg).toContain("WORKING.md");
  });
});

// ─── handleContextMonitor ─────────────────────────────────────────────────

describe("handleContextMonitor", () => {
  test("returns void when context is healthy", () => {
    const cwd = setupTmp();
    const ctx: PiExtensionContext = {
      getContextUsage: () => ({
        tokens: 10_000,
        contextWindow: 200_000, percent: null,
      }),
    };

    expect(handleContextMonitor(cwd, ctx)).toBeUndefined();
  });

  test("returns warning for high usage", () => {
    const cwd = setupTmp();
    const ctx: PiExtensionContext = {
      getContextUsage: () => ({
        tokens: 120_000,
        contextWindow: 200_000, percent: null,
      }),
    };

    const msg = handleContextMonitor(cwd, ctx);
    expect(msg).toBeDefined();
    expect(msg).toContain("HIGH");
  });
});

// ─── handleSessionPersist ─────────────────────────────────────────────────

describe("handleSessionPersist", () => {
  test("removes session lock", () => {
    const cwd = setupTmp();
    const lockPath = join(cwd, ".claude", ".session-lock");
    writeFileSync(lockPath, '{"created_at":"2025-01-01"}', "utf-8");
    expect(existsSync(lockPath)).toBe(true);

    handleSessionPersist(cwd);
    expect(existsSync(lockPath)).toBe(false);
  });

  test("appends session-end marker to WORKING.md", () => {
    const cwd = setupTmp();
    writeFileSync(
      join(cwd, ".planning", "WORKING.md"),
      "# Working Memory\n\nSome content",
      "utf-8",
    );

    handleSessionPersist(cwd, "user_exit");

    const content = readFileSync(join(cwd, ".planning", "WORKING.md"), "utf-8");
    expect(content).toContain("Session ended:");
    expect(content).toContain("user_exit");
  });

  test("sanitizes reason (SEC-02)", () => {
    const cwd = setupTmp();
    writeFileSync(
      join(cwd, ".planning", "WORKING.md"),
      "# Working Memory\n\nSome content",
      "utf-8",
    );

    handleSessionPersist(cwd, "test<script>alert('xss')</script>");

    const content = readFileSync(join(cwd, ".planning", "WORKING.md"), "utf-8");
    // Should not contain HTML/script tags — angle brackets are stripped
    expect(content).not.toContain("<script>");
    expect(content).not.toContain("</script>");
    // Parentheses from injection attempt should be stripped from the reason
    expect(content).toContain("testscriptalertxssscript");
    expect(content).toContain("Session ended:");
  });

  test("updates existing session-end marker instead of duplicating", () => {
    const cwd = setupTmp();
    writeFileSync(
      join(cwd, ".planning", "WORKING.md"),
      "# Working Memory\n\n---\n*Session ended: 2025-01-01T00:00:00Z (reason: previous)*\n",
      "utf-8",
    );

    handleSessionPersist(cwd, "new_exit");

    const content = readFileSync(join(cwd, ".planning", "WORKING.md"), "utf-8");
    // Should have exactly one session-end marker
    const matches = content.match(/Session ended:/g);
    expect(matches?.length).toBe(1);
    expect(content).toContain("new_exit");
    expect(content).not.toContain("previous");
  });

  test("skips if WORKING.md is missing", () => {
    const cwd = setupTmp();
    // Should not throw
    handleSessionPersist(cwd, "test");
  });

  test("skips if WORKING.md is empty", () => {
    const cwd = setupTmp();
    writeFileSync(join(cwd, ".planning", "WORKING.md"), "", "utf-8");

    handleSessionPersist(cwd, "test");

    const content = readFileSync(join(cwd, ".planning", "WORKING.md"), "utf-8");
    expect(content).toBe("");
  });
});

// ─── handleSessionStart ───────────────────────────────────────────────────

describe("handleSessionStart", () => {
  test("creates .planning/ directory and memory files", () => {
    const cwd = setupTmp();
    // Remove .planning to test creation
    rmSync(join(cwd, ".planning"), { recursive: true, force: true });

    const msg = handleSessionStart(cwd);
    expect(msg).toBeDefined();
    expect(msg).toContain("Initialized .planning/");

    // Verify files were created
    expect(existsSync(join(cwd, ".planning", "MEMORY.md"))).toBe(true);
    expect(existsSync(join(cwd, ".planning", "WORKING.md"))).toBe(true);
    expect(existsSync(join(cwd, ".planning", "STATE.md"))).toBe(true);
    expect(existsSync(join(cwd, ".planning", "ROADMAP.md"))).toBe(true);
  });

  test("returns void when all files already exist", () => {
    const cwd = setupTmp();
    // Create all memory files
    for (const file of [
      "MEMORY.md",
      "WORKING.md",
      "STATE.md",
      "ROADMAP.md",
      "config.json",
      "BRAIN.md",
    ]) {
      writeFileSync(join(cwd, ".planning", file), "# existing", "utf-8");
    }

    const msg = handleSessionStart(cwd);
    // When nothing is created, should return void
    expect(msg).toBeUndefined();
  });
});
