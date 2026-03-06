/**
 * Tests for the portable hook abstraction layer.
 *
 * Covers:
 * - PortableHookConfigSchema validation
 * - createPortableHook factory (canonical + platform outputs)
 * - detectPlatform env-based detection
 * - Platform-specific config generation
 * - Edge cases (subset platforms, missing filters)
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import {
  SUPPORTED_PLATFORMS,
  PortableHookConfigSchema,
  createPortableHook,
  detectPlatform,
} from "../../../src/hooks/__helpers/portable-hook";

import type {
  PortableHookConfig,
  SupportedPlatform,
} from "../../../src/hooks/__helpers/portable-hook";

// ---- Schema validation ----

describe("PortableHookConfigSchema", () => {
  test("accepts a valid full config", () => {
    const config = {
      name: "my-hook",
      event: "post_tool_use",
      tool_filter: "Edit|Write",
      script: "my-hook.sh",
      timeout: 10,
      async: true,
      status_message: "Running...",
      platforms: ["claude-code", "cursor"],
    };
    const result = PortableHookConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test("applies defaults for timeout, async, platforms", () => {
    const config = {
      name: "minimal-hook",
      event: "stop",
      script: "minimal.sh",
    };
    const result = PortableHookConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout).toBe(30);
      expect(result.data.async).toBe(false);
      expect(result.data.platforms).toEqual(["claude-code", "cursor", "pi"]);
    }
  });

  test("rejects invalid hook name (camelCase)", () => {
    const config = {
      name: "myHook",
      event: "stop",
      script: "test.sh",
    };
    const result = PortableHookConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("rejects invalid event name", () => {
    const config = {
      name: "test-hook",
      event: "invalid_event",
      script: "test.sh",
    };
    const result = PortableHookConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("rejects non-positive timeout", () => {
    const config = {
      name: "test-hook",
      event: "stop",
      script: "test.sh",
      timeout: 0,
    };
    const result = PortableHookConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  test("rejects invalid platform", () => {
    const config = {
      name: "test-hook",
      event: "stop",
      script: "test.sh",
      platforms: ["vscode"],
    };
    const result = PortableHookConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

// ---- createPortableHook ----

describe("createPortableHook", () => {
  test("produces canonical hook and all platform configs", () => {
    const result = createPortableHook({
      name: "test-hook",
      event: "post_tool_use",
      tool_filter: "Edit|Write",
      script: "test-hook.sh",
      timeout: 10,
      async: true,
      status_message: "Testing...",
      platforms: ["claude-code", "cursor", "pi"],
    });

    expect(result.name).toBe("test-hook");

    // Canonical
    expect(result.canonical.event).toBe("post_tool_use");
    expect(result.canonical.tool_filter).toBe("Edit|Write");
    expect(result.canonical.script).toBe("test-hook.sh");

    // Claude Code
    expect(result.platforms["claude-code"]).toBeDefined();
    expect(result.platforms["claude-code"]!.event).toBe("PostToolUse");
    expect(result.platforms["claude-code"]!.matcher).toBe("Edit|Write");
    expect(result.platforms["claude-code"]!.async).toBe(true);
    expect(result.platforms["claude-code"]!.statusMessage).toBe("Testing...");

    // Cursor
    expect(result.platforms.cursor).toBeDefined();
    expect(result.platforms.cursor!.event).toBe("afterFileEdit");
    expect(result.platforms.cursor!.async).toBe(false); // Cursor doesn't support async

    // Pi
    expect(result.platforms.pi).toBeDefined();
    expect(result.platforms.pi!.event).toBe("tool_execution_end");
    expect(result.platforms.pi!.matcher).toEqual(["edit", "write"]);
  });

  test("generates only requested platforms", () => {
    const result = createPortableHook({
      name: "claude-only",
      event: "session_start",
      script: "start.sh",
      timeout: 15,
      async: false,
      platforms: ["claude-code"],
    });

    expect(result.platforms["claude-code"]).toBeDefined();
    expect(result.platforms.cursor).toBeUndefined();
    expect(result.platforms.pi).toBeUndefined();
  });

  test("handles pre_tool_use with command_filter", () => {
    const result = createPortableHook({
      name: "pre-commit",
      event: "pre_tool_use",
      tool_filter: "Bash",
      command_filter: "git commit|git merge",
      script: "pre-commit.sh",
      timeout: 120,
      async: false,
      platforms: ["claude-code", "cursor", "pi"],
    });

    // Claude gets tool_filter as matcher
    expect(result.platforms["claude-code"]!.matcher).toBe("Bash");
    // Cursor gets command_filter as matcher
    expect(result.platforms.cursor!.matcher).toBe("git commit|git merge");
    // Pi gets tool_filter split
    expect(result.platforms.pi!.matcher).toEqual(["bash"]);
  });

  test("handles hook without filters", () => {
    const result = createPortableHook({
      name: "context-hook",
      event: "stop",
      script: "context.sh",
      timeout: 5,
      async: false,
      platforms: ["claude-code", "cursor", "pi"],
    });

    expect(result.platforms["claude-code"]!.matcher).toBeUndefined();
    expect(result.platforms.cursor!.matcher).toBeUndefined();
    expect(result.platforms.pi!.matcher).toBeUndefined();
  });

  test("throws on invalid config", () => {
    expect(() =>
      createPortableHook({
        name: "BAD_NAME",
        event: "post_tool_use",
        script: "test.sh",
      } as any),
    ).toThrow();
  });
});

// ---- detectPlatform ----

describe("detectPlatform", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear platform env vars
    delete process.env.CLAUDE_CODE;
    delete process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CURSOR;
    delete process.env.CURSOR_SESSION_ID;
    delete process.env.PI_AGENT;
    delete process.env.PI_SESSION_ID;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  test("detects Claude Code via CLAUDE_CODE=1", () => {
    process.env.CLAUDE_CODE = "1";
    expect(detectPlatform()).toBe("claude-code");
  });

  test("detects Claude Code via CLAUDE_PROJECT_DIR", () => {
    process.env.CLAUDE_PROJECT_DIR = "/some/path";
    expect(detectPlatform()).toBe("claude-code");
  });

  test("detects Cursor via CURSOR=1", () => {
    process.env.CURSOR = "1";
    expect(detectPlatform()).toBe("cursor");
  });

  test("detects Cursor via CURSOR_SESSION_ID", () => {
    process.env.CURSOR_SESSION_ID = "abc123";
    expect(detectPlatform()).toBe("cursor");
  });

  test("detects Pi via PI_AGENT=1", () => {
    process.env.PI_AGENT = "1";
    expect(detectPlatform()).toBe("pi");
  });

  test("detects Pi via PI_SESSION_ID", () => {
    process.env.PI_SESSION_ID = "session-xyz";
    expect(detectPlatform()).toBe("pi");
  });

  test("returns undefined when no platform env is set", () => {
    // All platform env vars cleared in beforeEach
    // But CLAUDE_PROJECT_DIR might be set in the test runner environment
    delete process.env.CLAUDE_CODE;
    delete process.env.CLAUDE_PROJECT_DIR;
    delete process.env.CURSOR;
    delete process.env.CURSOR_SESSION_ID;
    delete process.env.PI_AGENT;
    delete process.env.PI_SESSION_ID;
    expect(detectPlatform()).toBeUndefined();
  });

  test("Claude Code takes priority over Cursor", () => {
    process.env.CLAUDE_CODE = "1";
    process.env.CURSOR = "1";
    expect(detectPlatform()).toBe("claude-code");
  });
});

// ---- SUPPORTED_PLATFORMS ----

describe("SUPPORTED_PLATFORMS", () => {
  test("contains exactly 3 platforms", () => {
    expect(SUPPORTED_PLATFORMS.length).toBe(3);
  });

  test("includes claude-code, cursor, pi", () => {
    expect(SUPPORTED_PLATFORMS).toContain("claude-code");
    expect(SUPPORTED_PLATFORMS).toContain("cursor");
    expect(SUPPORTED_PLATFORMS).toContain("pi");
  });
});
