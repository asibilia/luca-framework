import { describe, test, expect } from "bun:test";
import path from "path";
import {
  assertSafeCleanTarget,
  SAFE_CLEAN_ROOTS,
} from "../../scripts/build-utils";

const PROJECT_ROOT = path.resolve(process.cwd());

describe("SAFE_CLEAN_ROOTS", () => {
  test("contains expected root directories", () => {
    expect(SAFE_CLEAN_ROOTS).toContain(".claude");
    expect(SAFE_CLEAN_ROOTS).toContain(".cursor");
    expect(SAFE_CLEAN_ROOTS).toContain("dist");
    expect(SAFE_CLEAN_ROOTS).toHaveLength(3);
  });
});

describe("assertSafeCleanTarget", () => {
  test("accepts .claude subdirectories", () => {
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "agents")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "hooks")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "skills")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude", "rules")),
    ).not.toThrow();
  });

  test("accepts .cursor subdirectories", () => {
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "agents")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "hooks")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "skills")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor", "rules")),
    ).not.toThrow();
  });

  test("accepts dist subdirectories", () => {
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, "dist")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, "dist", "plugin")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(
        path.join(PROJECT_ROOT, "dist", "plugin", "agents"),
      ),
    ).not.toThrow();
  });

  test("accepts root-level .claude and .cursor directories", () => {
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".claude")),
    ).not.toThrow();
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".cursor")),
    ).not.toThrow();
  });

  test("rejects paths outside the project root", () => {
    expect(() => assertSafeCleanTarget("/")).toThrow(
      /outside the project root/,
    );
    expect(() => assertSafeCleanTarget("/etc")).toThrow(
      /outside the project root/,
    );
    expect(() => assertSafeCleanTarget("/Users")).toThrow(
      /outside the project root/,
    );
    expect(() => assertSafeCleanTarget("/tmp/malicious")).toThrow(
      /outside the project root/,
    );
  });

  test("rejects paths within project root but outside allowed directories", () => {
    expect(() => assertSafeCleanTarget(path.join(PROJECT_ROOT, "src"))).toThrow(
      /not within an allowed output directory/,
    );
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, "scripts")),
    ).toThrow(/not within an allowed output directory/);
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, "node_modules")),
    ).toThrow(/not within an allowed output directory/);
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, "packages")),
    ).toThrow(/not within an allowed output directory/);
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, ".planning")),
    ).toThrow(/not within an allowed output directory/);
  });

  test("rejects the project root itself", () => {
    expect(() => assertSafeCleanTarget(PROJECT_ROOT)).toThrow(
      /not within an allowed output directory/,
    );
  });

  test("rejects path traversal attempts", () => {
    expect(() =>
      assertSafeCleanTarget(path.join(PROJECT_ROOT, "..", "other-project")),
    ).toThrow(/outside the project root/);
    expect(() =>
      assertSafeCleanTarget(
        path.join(PROJECT_ROOT, ".claude", "..", "..", "etc"),
      ),
    ).toThrow();
  });

  test("handles relative paths by resolving against cwd", () => {
    expect(() => assertSafeCleanTarget(".claude/agents")).not.toThrow();
    expect(() => assertSafeCleanTarget("src")).toThrow(
      /not within an allowed output directory/,
    );
  });
});
