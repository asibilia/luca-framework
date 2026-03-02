/**
 * Unit tests for Pi tool name mapping and provider detection.
 *
 * Validates that Claude Code tool names are correctly translated to
 * pi-compatible names, and that the provider is detected from env vars.
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import {
  mapToolsForPi,
  detectPiProvider,
  getRequiredExtensions,
} from "~/hooks/pi-extensions/__helpers/spawn";

describe("mapToolsForPi", () => {
  test("maps standard Claude Code tools to pi equivalents", () => {
    const input = ["Read", "Write", "Edit", "Bash", "Grep", "Glob"];
    const result = mapToolsForPi(input);
    expect(result).toEqual(["read", "write", "edit", "bash", "grep", "find"]);
  });

  test("drops tools with no pi equivalent", () => {
    const input = ["Read", "WebSearch", "WebFetch", "Task"];
    const result = mapToolsForPi(input);
    expect(result).toEqual(["read"]);
  });

  test("drops MCP tool prefixes", () => {
    const input = ["Read", "mcp__context7__resolve-library-id"];
    const result = mapToolsForPi(input);
    expect(result).toEqual(["read"]);
  });

  test("drops mcp_ single-underscore prefixes too", () => {
    const input = ["Edit", "mcp_some-tool"];
    const result = mapToolsForPi(input);
    expect(result).toEqual(["edit"]);
  });

  test("returns empty array for empty input", () => {
    expect(mapToolsForPi([])).toEqual([]);
  });

  test("returns empty array when all tools are unmappable", () => {
    const input = ["WebSearch", "Task"];
    const result = mapToolsForPi(input);
    expect(result).toEqual([]);
  });

  test("handles lowercase input as well", () => {
    const input = ["read", "glob", "bash"];
    const result = mapToolsForPi(input);
    expect(result).toEqual(["read", "find", "bash"]);
  });

  test("drops unknown tool names not in the map", () => {
    const input = ["Read", "SomeUnknownTool", "Edit"];
    const result = mapToolsForPi(input);
    expect(result).toEqual(["read", "edit"]);
  });
});

describe("detectPiProvider", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = [
    "PI_PROVIDER",
    "ANTHROPIC_API_KEY",
    "GOOGLE_API_KEY",
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
  ];

  beforeEach(() => {
    for (const key of envKeys) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (savedEnv[key] !== undefined) {
        process.env[key] = savedEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  test("returns PI_PROVIDER when explicitly set", () => {
    process.env.PI_PROVIDER = "anthropic";
    expect(detectPiProvider()).toBe("anthropic");
  });

  test("detects anthropic from ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(detectPiProvider()).toBe("anthropic");
  });

  test("detects google from GOOGLE_API_KEY", () => {
    process.env.GOOGLE_API_KEY = "AIza-test";
    expect(detectPiProvider()).toBe("google");
  });

  test("detects google from GEMINI_API_KEY", () => {
    process.env.GEMINI_API_KEY = "AIza-test";
    expect(detectPiProvider()).toBe("google");
  });

  test("detects openai from OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(detectPiProvider()).toBe("openai");
  });

  test("PI_PROVIDER takes precedence over API key detection", () => {
    process.env.PI_PROVIDER = "google";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(detectPiProvider()).toBe("google");
  });

  test("returns undefined when no env vars are set", () => {
    expect(detectPiProvider()).toBeUndefined();
  });

  test("ANTHROPIC_API_KEY takes precedence over OPENAI_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-test";
    expect(detectPiProvider()).toBe("anthropic");
  });
});

describe("getRequiredExtensions", () => {
  test("returns luca-search extension for WebSearch", () => {
    const result = getRequiredExtensions(["Read", "WebSearch"]);
    expect(result).toEqual([".pi/extensions/luca-search.ts"]);
  });

  test("returns empty array for WebFetch (no extension equivalent)", () => {
    const result = getRequiredExtensions(["Read", "WebFetch"]);
    expect(result).toEqual([]);
  });

  test("returns empty array when no extension tools are present", () => {
    const result = getRequiredExtensions(["Read", "Write", "Edit", "Bash"]);
    expect(result).toEqual([]);
  });

  test("returns empty array for empty input", () => {
    expect(getRequiredExtensions([])).toEqual([]);
  });

  test("ignores unknown tool names", () => {
    const result = getRequiredExtensions(["UnknownTool", "AnotherOne"]);
    expect(result).toEqual([]);
  });

  test("deduplicates when WebSearch appears multiple times", () => {
    const result = getRequiredExtensions(["WebSearch", "Read", "WebSearch"]);
    expect(result).toEqual([".pi/extensions/luca-search.ts"]);
  });
});
