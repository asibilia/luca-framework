import { describe, test, expect } from "bun:test";
import { getArg, hasFlag, escapeRegex } from "../cli-utils.ts";

// ─── getArg ──────────────────────────────────────────────────────────────────

describe("getArg", () => {
  test("extracts value from --name=value argument", () => {
    expect(getArg(["--tags=a,b,c"], "tags")).toBe("a,b,c");
  });

  test("returns default when argument is not found", () => {
    expect(getArg(["--other=x"], "tags", "fallback")).toBe("fallback");
  });

  test("returns empty string default when argument is not found and no default given", () => {
    expect(getArg(["--other=x"], "tags")).toBe("");
  });

  test("handles empty value", () => {
    expect(getArg(["--tags="], "tags")).toBe("");
  });

  test("handles value with equals sign", () => {
    expect(getArg(["--data=key=value"], "data")).toBe("key=value");
  });

  test("finds argument among multiple args", () => {
    const args = ["--force", "--tags=a,b", "--limit=5", "--verbose"];
    expect(getArg(args, "tags")).toBe("a,b");
    expect(getArg(args, "limit")).toBe("5");
  });

  test("returns first matching argument when duplicated", () => {
    expect(getArg(["--tags=first", "--tags=second"], "tags")).toBe("first");
  });

  test("handles empty args array", () => {
    expect(getArg([], "tags")).toBe("");
    expect(getArg([], "tags", "default")).toBe("default");
  });

  test("does not match partial name prefix", () => {
    expect(getArg(["--tags-extra=x"], "tags")).toBe("");
  });

  test("does not match flag-only (no =)", () => {
    expect(getArg(["--force"], "force")).toBe("");
  });
});

// ─── hasFlag ─────────────────────────────────────────────────────────────────

describe("hasFlag", () => {
  test("returns true when flag is present", () => {
    expect(hasFlag(["--force", "--verbose"], "force")).toBe(true);
  });

  test("returns false when flag is not present", () => {
    expect(hasFlag(["--force"], "verbose")).toBe(false);
  });

  test("does not match --name=value as a flag", () => {
    expect(hasFlag(["--force=true"], "force")).toBe(false);
  });

  test("handles empty args array", () => {
    expect(hasFlag([], "force")).toBe(false);
  });

  test("handles multiple flags", () => {
    const args = ["--force", "--dry-run", "--verbose"];
    expect(hasFlag(args, "force")).toBe(true);
    expect(hasFlag(args, "dry-run")).toBe(true);
    expect(hasFlag(args, "verbose")).toBe(true);
    expect(hasFlag(args, "quiet")).toBe(false);
  });
});

// ─── escapeRegex ─────────────────────────────────────────────────────────────

describe("escapeRegex", () => {
  test("escapes dot", () => {
    expect(escapeRegex("foo.bar")).toBe("foo\\.bar");
  });

  test("escapes asterisk", () => {
    expect(escapeRegex("foo*bar")).toBe("foo\\*bar");
  });

  test("escapes plus", () => {
    expect(escapeRegex("a+b")).toBe("a\\+b");
  });

  test("escapes question mark", () => {
    expect(escapeRegex("a?b")).toBe("a\\?b");
  });

  test("escapes caret", () => {
    expect(escapeRegex("^start")).toBe("\\^start");
  });

  test("escapes dollar sign", () => {
    expect(escapeRegex("end$")).toBe("end\\$");
  });

  test("escapes curly braces", () => {
    expect(escapeRegex("{a,b}")).toBe("\\{a,b\\}");
  });

  test("escapes parentheses", () => {
    expect(escapeRegex("(group)")).toBe("\\(group\\)");
  });

  test("escapes square brackets", () => {
    expect(escapeRegex("[class]")).toBe("\\[class\\]");
  });

  test("escapes pipe", () => {
    expect(escapeRegex("a|b")).toBe("a\\|b");
  });

  test("escapes backslash", () => {
    expect(escapeRegex("a\\b")).toBe("a\\\\b");
  });

  test("returns plain string unchanged", () => {
    expect(escapeRegex("hello world")).toBe("hello world");
  });

  test("handles empty string", () => {
    expect(escapeRegex("")).toBe("");
  });

  test("handles multiple special characters together", () => {
    const input = "## Previous Milestones";
    const result = escapeRegex(input);
    // ## should not be escaped (# is not a regex special char)
    expect(result).toBe("## Previous Milestones");
  });

  test("produces regex-safe string", () => {
    const header = "Foo (Bar) [Baz]";
    const escaped = escapeRegex(header);
    const pattern = new RegExp(`^## ${escaped}\\s*$`, "m");
    const content = "## Foo (Bar) [Baz]\nSome content here";
    expect(content.match(pattern)).not.toBeNull();
  });
});
