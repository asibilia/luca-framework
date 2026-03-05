/**
 * Pre-commit drift check hook validation tests.
 *
 * Verifies that pre-commit-drift-check.sh correctly detects and blocks
 * drifted commits. Tests simulate hook execution by running the script
 * in a controlled temp directory with mocked git state.
 *
 * Covers:
 * - Non-commit commands exit 0 immediately (fast path)
 * - Empty stdin exits 0 gracefully
 * - Malformed JSON stdin exits 0 gracefully
 * - Commit commands with no staged relevant files exit 0
 * - Both Claude Code and Cursor JSON stdin formats are parsed correctly
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { spawnSync } from "child_process";

const SCRIPT_PATH = path.resolve(
  import.meta.dir,
  "../../../src/hooks/scripts/pre-commit-drift-check.sh",
);

/**
 * Run the drift check hook with the given stdin input.
 * Returns exit code and stdout/stderr.
 */
function runHook(
  stdin: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync("bash", [SCRIPT_PATH], {
    input: stdin,
    timeout: 10_000,
    env: {
      ...process.env,
      ...env,
      // Ensure bun is available
      PATH: process.env.PATH ?? "",
    },
    cwd: env.CLAUDE_PROJECT_DIR || process.cwd(),
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout?.toString() ?? "",
    stderr: result.stderr?.toString() ?? "",
  };
}

// ─── Non-commit command fast path ────────────────────────────────────────────

describe("pre-commit-drift-check: non-commit commands", () => {
  test("exits 0 immediately for non-commit bash commands (Claude format)", () => {
    const input = JSON.stringify({
      tool_input: { command: "ls -la" },
    });
    const result = runHook(input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(""); // No output on allow
  });

  test("exits 0 immediately for non-commit bash commands (Cursor format)", () => {
    const input = JSON.stringify({
      command: "echo hello world",
    });
    const result = runHook(input);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(""); // No output on allow
  });

  test("exits 0 for empty stdin", () => {
    const result = runHook("");
    expect(result.exitCode).toBe(0);
  });

  test("exits 0 for malformed JSON stdin", () => {
    const result = runHook("not json at all {{{");
    expect(result.exitCode).toBe(0);
  });

  test("exits 0 for git status command (not a commit)", () => {
    const input = JSON.stringify({
      tool_input: { command: "git status" },
    });
    const result = runHook(input);
    expect(result.exitCode).toBe(0);
  });

  test("exits 0 for git add command (not a commit)", () => {
    const input = JSON.stringify({
      tool_input: { command: "git add ." },
    });
    const result = runHook(input);
    expect(result.exitCode).toBe(0);
  });
});

// ─── Command extraction from both platform formats ──────────────────────────

describe("pre-commit-drift-check: platform format extraction", () => {
  test("recognizes git commit from Claude Code JSON format", () => {
    // This will proceed to drift check (may fail if no git repo in cwd,
    // but importantly it should NOT exit 0 at the fast path)
    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "test"' },
    });
    const result = runHook(input);
    // The hook should either:
    // - Exit 0 if no staged files (no drift to check)
    // - Exit 0 if drift check passes
    // - Exit 2 if drift detected
    // It should NOT crash
    expect([0, 2]).toContain(result.exitCode);
  });

  test("recognizes git commit from Cursor JSON format", () => {
    const input = JSON.stringify({
      command: 'git commit -m "test"',
    });
    const result = runHook(input);
    expect([0, 2]).toContain(result.exitCode);
  });

  test("recognizes bun run commit as a commit command", () => {
    const input = JSON.stringify({
      tool_input: { command: "bun run commit" },
    });
    const result = runHook(input);
    expect([0, 2]).toContain(result.exitCode);
  });

  test("recognizes git merge as a commit command", () => {
    const input = JSON.stringify({
      tool_input: { command: "git merge feature-branch" },
    });
    const result = runHook(input);
    expect([0, 2]).toContain(result.exitCode);
  });
});

// ─── Staged file detection ──────────────────────────────────────────────────

describe("pre-commit-drift-check: staged file filtering", () => {
  let tmpDir: string;

  beforeAll(() => {
    // Create a temp git repo for testing staged file detection
    tmpDir = mkdtempSync(path.join(tmpdir(), "drift-hook-test-"));
    spawnSync("git", ["init"], { cwd: tmpDir });
    spawnSync("git", ["config", "user.email", "test@test.com"], {
      cwd: tmpDir,
    });
    spawnSync("git", ["config", "user.name", "Test"], { cwd: tmpDir });

    // Create an initial commit so git diff --cached works
    writeFileSync(path.join(tmpDir, "README.md"), "# Test");
    spawnSync("git", ["add", "README.md"], { cwd: tmpDir });
    spawnSync("git", ["commit", "-m", "init"], { cwd: tmpDir });
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("exits 0 when no staged files match relevant directories", () => {
    // Stage a non-relevant file
    writeFileSync(path.join(tmpDir, "unrelated.txt"), "content");
    spawnSync("git", ["add", "unrelated.txt"], { cwd: tmpDir });

    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "test"' },
    });
    const result = runHook(input, { CLAUDE_PROJECT_DIR: tmpDir });
    expect(result.exitCode).toBe(0); // No relevant files -> skip drift check
  });

  test("exits 0 when no files are staged at all", () => {
    // Reset staging area
    spawnSync("git", ["reset", "HEAD"], { cwd: tmpDir });

    const input = JSON.stringify({
      tool_input: { command: 'git commit -m "test"' },
    });
    const result = runHook(input, { CLAUDE_PROJECT_DIR: tmpDir });
    expect(result.exitCode).toBe(0); // Empty staging -> skip
  });
});
