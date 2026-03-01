/**
 * Tests for runtime detection helper.
 */
import { describe, test, expect, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  detectRuntime,
  getFormatterCmd,
  getTscCmd,
  getTestCmd,
} from "~/hooks/pi-extensions/__helpers/runtime-detect";

const tmpDir = join(import.meta.dir, ".tmp-runtime-detect");

function setupTmp(configJson?: string): string {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(join(tmpDir, ".planning"), { recursive: true });
  if (configJson) {
    writeFileSync(
      join(tmpDir, ".planning", "config.json"),
      configJson,
      "utf-8",
    );
  }
  return tmpDir;
}

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("detectRuntime", () => {
  test('returns "bun" when config.json is missing', () => {
    const cwd = setupTmp();
    expect(detectRuntime(cwd)).toBe("bun");
  });

  test("reads runtime field from valid config.json", () => {
    const cwd = setupTmp(JSON.stringify({ runtime: "node" }));
    expect(detectRuntime(cwd)).toBe("node");
  });

  test('returns "bun" for bun runtime in config', () => {
    const cwd = setupTmp(JSON.stringify({ runtime: "bun" }));
    expect(detectRuntime(cwd)).toBe("bun");
  });

  test('falls back to "bun" on invalid JSON', () => {
    const cwd = setupTmp("not valid json {{{");
    expect(detectRuntime(cwd)).toBe("bun");
  });

  test('falls back to "bun" when runtime field is missing', () => {
    const cwd = setupTmp(JSON.stringify({ mode: "interactive" }));
    expect(detectRuntime(cwd)).toBe("bun");
  });
});

describe("command builders", () => {
  test("getFormatterCmd returns bun-based command for bun runtime", () => {
    expect(getFormatterCmd("bun")).toContain("bunx");
    expect(getFormatterCmd("bun")).toContain("prettier");
  });

  test("getFormatterCmd returns npx-based command for node runtime", () => {
    expect(getFormatterCmd("node")).toContain("npx");
    expect(getFormatterCmd("node")).toContain("prettier");
  });

  test("getTscCmd returns bun-based command for bun runtime", () => {
    expect(getTscCmd("bun")).toContain("bunx");
    expect(getTscCmd("bun")).toContain("tsc --noEmit");
  });

  test("getTscCmd returns npx-based command for node runtime", () => {
    expect(getTscCmd("node")).toContain("npx");
    expect(getTscCmd("node")).toContain("tsc --noEmit");
  });

  test("getTestCmd returns bun test for bun runtime", () => {
    expect(getTestCmd("bun")).toBe("bun test");
  });

  test("getTestCmd returns npm test for node runtime", () => {
    expect(getTestCmd("node")).toBe("npm test");
  });
});
