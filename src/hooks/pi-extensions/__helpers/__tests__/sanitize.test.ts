/**
 * Tests for shared sanitization utilities (PLAN-66-B + PLAN-66-C).
 *
 * Validates all sanitization functions used across Pi extensions
 * for input validation and normalization.
 */
import { test, expect, describe } from "bun:test";
import {
  escapeRegExp,
  sanitizeName,
  sanitizeForTemplate,
  validateScriptPath,
  isValidIdentifier,
  normalizeToolName,
  isWithinDirectory,
  normalizeContext,
} from "../sanitize";

// ---------------------------------------------------------------------------
// escapeRegExp (PLAN-66-B)
// ---------------------------------------------------------------------------

describe("escapeRegExp", () => {
  test("escapes all regex metacharacters", () => {
    expect(escapeRegExp(".*+?^${}()|[]\\")).toBe(
      "\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\",
    );
  });

  test("leaves alphanumeric and spaces unchanged", () => {
    expect(escapeRegExp("hello world 123")).toBe("hello world 123");
  });

  test("handles empty string", () => {
    expect(escapeRegExp("")).toBe("");
  });

  test("escapes field names with special characters", () => {
    const escaped = escapeRegExp("Task Complexity:");
    const regex = new RegExp(escaped);
    expect(regex.test("Task Complexity:")).toBe(true);
    expect(regex.test("Task ComplexityX")).toBe(false);
  });

  test("escapes period (dot) in field names", () => {
    const escaped = escapeRegExp("v2.1.0");
    const regex = new RegExp(escaped);
    expect(regex.test("v2.1.0")).toBe(true);
    expect(regex.test("v2X1X0")).toBe(false);
  });

  test("escapes parentheses and pipes", () => {
    expect(escapeRegExp("(a|b)")).toBe("\\(a\\|b\\)");
  });
});

// ---------------------------------------------------------------------------
// sanitizeName (PLAN-66-B)
// ---------------------------------------------------------------------------

describe("sanitizeName", () => {
  test("replaces non-alphanumeric characters with hyphens", () => {
    expect(sanitizeName("my session!@#name")).toBe("my-session-name");
  });

  test("collapses consecutive hyphens", () => {
    expect(sanitizeName("a!!!b")).toBe("a-b");
  });

  test("strips leading and trailing hyphens", () => {
    expect(sanitizeName("--leading--")).toBe("leading");
  });

  test("respects maxLength parameter", () => {
    const long = "a".repeat(100);
    expect(sanitizeName(long, 10)).toBe("a".repeat(10));
  });

  test("uses default maxLength of 64", () => {
    const long = "a".repeat(100);
    expect(sanitizeName(long)).toBe("a".repeat(64));
  });

  test("preserves underscores", () => {
    expect(sanitizeName("my_valid_name")).toBe("my_valid_name");
  });

  test("preserves hyphens", () => {
    expect(sanitizeName("my-valid-name")).toBe("my-valid-name");
  });

  test("handles empty string", () => {
    expect(sanitizeName("")).toBe("");
  });

  test("handles string of only special characters", () => {
    expect(sanitizeName("!@#$%^&*")).toBe("");
  });

  test("handles spaces", () => {
    expect(sanitizeName("hello world")).toBe("hello-world");
  });
});

// ---------------------------------------------------------------------------
// sanitizeForTemplate (PLAN-66-B)
// ---------------------------------------------------------------------------

describe("sanitizeForTemplate", () => {
  test("removes backticks", () => {
    expect(sanitizeForTemplate("hello `world`")).toBe("hello world");
  });

  test("removes ${ sequences", () => {
    expect(sanitizeForTemplate("hello ${injected}")).toBe("hello injected}");
  });

  test("replaces newlines with spaces", () => {
    expect(sanitizeForTemplate("line1\nline2\rline3")).toBe(
      "line1 line2 line3",
    );
  });

  test("removes control characters", () => {
    expect(sanitizeForTemplate("hello\x00\x01\x1fworld")).toBe("helloworld");
  });

  test("handles empty string", () => {
    expect(sanitizeForTemplate("")).toBe("");
  });

  test("preserves normal text", () => {
    expect(sanitizeForTemplate("normal text 123")).toBe("normal text 123");
  });

  test("handles combined injection attempt", () => {
    const malicious = "`${process.exit(1)}`\n\x00";
    const sanitized = sanitizeForTemplate(malicious);
    expect(sanitized).not.toContain("`");
    expect(sanitized).not.toContain("${");
    expect(sanitized).not.toContain("\n");
    expect(sanitized).not.toContain("\x00");
  });

  test("removes DEL character (0x7f)", () => {
    expect(sanitizeForTemplate("hello\x7fworld")).toBe("helloworld");
  });
});

// ---------------------------------------------------------------------------
// validateScriptPath (PLAN-66-B)
// ---------------------------------------------------------------------------

describe("validateScriptPath", () => {
  test("accepts valid relative paths", () => {
    expect(validateScriptPath("hooks/pre-commit.sh")).toBe(true);
    expect(validateScriptPath("scripts/run-tests.sh")).toBe(true);
    expect(validateScriptPath("my-hook.sh")).toBe(true);
  });

  test("rejects empty string", () => {
    expect(validateScriptPath("")).toBe(false);
  });

  test("rejects path traversal", () => {
    expect(validateScriptPath("../../../etc/passwd")).toBe(false);
    expect(validateScriptPath("hooks/../../../etc/shadow")).toBe(false);
  });

  test("rejects absolute paths", () => {
    expect(validateScriptPath("/etc/passwd")).toBe(false);
    expect(validateScriptPath("/usr/bin/bash")).toBe(false);
  });

  test("rejects null bytes", () => {
    expect(validateScriptPath("hooks/script\0.sh")).toBe(false);
  });

  test("rejects paths with spaces", () => {
    expect(validateScriptPath("hooks/my script.sh")).toBe(false);
  });

  test("rejects paths with special characters", () => {
    expect(validateScriptPath("hooks/script;rm -rf /.sh")).toBe(false);
    expect(validateScriptPath("hooks/$(whoami).sh")).toBe(false);
    expect(validateScriptPath("hooks/`id`.sh")).toBe(false);
  });

  test("accepts paths with underscores and hyphens", () => {
    expect(validateScriptPath("hooks/my_hook-v2.sh")).toBe(true);
  });

  test("accepts nested paths", () => {
    expect(validateScriptPath("a/b/c/d/e.sh")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidIdentifier (PLAN-66-B)
// ---------------------------------------------------------------------------

describe("isValidIdentifier", () => {
  test("accepts alphanumeric strings", () => {
    expect(isValidIdentifier("hello123")).toBe(true);
  });

  test("accepts hyphens", () => {
    expect(isValidIdentifier("lu-router")).toBe(true);
  });

  test("accepts underscores", () => {
    expect(isValidIdentifier("my_agent")).toBe(true);
  });

  test("accepts mixed valid characters", () => {
    expect(isValidIdentifier("lu-executor_v2")).toBe(true);
  });

  test("rejects spaces", () => {
    expect(isValidIdentifier("bad agent")).toBe(false);
  });

  test("rejects special characters", () => {
    expect(isValidIdentifier("bad!agent")).toBe(false);
    expect(isValidIdentifier("bad@agent")).toBe(false);
    expect(isValidIdentifier("bad.agent")).toBe(false);
  });

  test("rejects empty string", () => {
    expect(isValidIdentifier("")).toBe(false);
  });

  test("rejects strings with only special characters", () => {
    expect(isValidIdentifier("!@#$%")).toBe(false);
  });

  test("rejects strings with path separators", () => {
    expect(isValidIdentifier("agent/name")).toBe(false);
  });

  test("rejects strings with template injection", () => {
    expect(isValidIdentifier("${injected}")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeToolName (PLAN-66-C Task 1)
// ---------------------------------------------------------------------------

describe("normalizeToolName", () => {
  test("trims leading and trailing whitespace", () => {
    expect(normalizeToolName(" luca_verify ")).toBe("luca_verify");
  });

  test("removes zero-width space (U+200B)", () => {
    expect(normalizeToolName("luca\u200B_verify")).toBe("luca_verify");
  });

  test("removes zero-width non-joiner (U+200C)", () => {
    expect(normalizeToolName("luca\u200C_verify")).toBe("luca_verify");
  });

  test("removes zero-width joiner (U+200D)", () => {
    expect(normalizeToolName("luca\u200D_verify")).toBe("luca_verify");
  });

  test("removes BOM (U+FEFF)", () => {
    expect(normalizeToolName("\uFEFFluca_verify")).toBe("luca_verify");
  });

  test("converts to lowercase", () => {
    expect(normalizeToolName("LUCA_VERIFY")).toBe("luca_verify");
  });

  test("collapses internal whitespace to single space", () => {
    expect(normalizeToolName("luca  _  verify")).toBe("luca _ verify");
  });

  test("handles combined normalization", () => {
    expect(normalizeToolName("  LUCA\u200B_VERIFY  ")).toBe("luca_verify");
  });

  test("handles empty string", () => {
    expect(normalizeToolName("")).toBe("");
  });

  test("handles whitespace-only string", () => {
    expect(normalizeToolName("   ")).toBe("");
  });

  test("preserves already normalized names", () => {
    expect(normalizeToolName("luca_verify")).toBe("luca_verify");
  });
});

// ---------------------------------------------------------------------------
// isWithinDirectory (PLAN-66-C Task 2)
// ---------------------------------------------------------------------------

describe("isWithinDirectory", () => {
  test("returns true for file within directory", () => {
    expect(
      isWithinDirectory("/project/.planning/BRAIN.md", "/project/.planning"),
    ).toBe(true);
  });

  test("returns false for path traversal attempt", () => {
    expect(
      isWithinDirectory(
        "/project/.planning/../etc/passwd",
        "/project/.planning",
      ),
    ).toBe(false);
  });

  test("returns false for file outside directory", () => {
    expect(isWithinDirectory("/etc/passwd", "/project/.planning")).toBe(false);
  });

  test("returns true for nested subdirectory files", () => {
    expect(
      isWithinDirectory(
        "/project/.planning/sub/dir/file.md",
        "/project/.planning",
      ),
    ).toBe(true);
  });

  test("returns true for exact directory match", () => {
    expect(isWithinDirectory("/project/.planning", "/project/.planning")).toBe(
      true,
    );
  });

  test("returns false for sibling directory with similar prefix", () => {
    // /project/.planning-extra is NOT within /project/.planning
    expect(
      isWithinDirectory(
        "/project/.planning-extra/file.md",
        "/project/.planning",
      ),
    ).toBe(false);
  });

  test("handles relative paths by resolving them", () => {
    // Both get resolved to absolute, so relative traversal is caught
    expect(
      isWithinDirectory(
        "/project/.planning/../../etc/passwd",
        "/project/.planning",
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeContext (PLAN-66-C Task 3)
// ---------------------------------------------------------------------------

describe("normalizeContext", () => {
  test("trims leading and trailing whitespace", () => {
    expect(normalizeContext("  Research  ")).toBe("research");
  });

  test("converts to lowercase", () => {
    expect(normalizeContext("EXECUTION")).toBe("execution");
  });

  test("collapses internal whitespace", () => {
    expect(normalizeContext("code  review")).toBe("code review");
  });

  test("returns empty string for null", () => {
    expect(normalizeContext(null)).toBe("");
  });

  test("returns empty string for undefined", () => {
    expect(normalizeContext(undefined)).toBe("");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(normalizeContext("   ")).toBe("");
  });

  test("handles combined normalization", () => {
    expect(normalizeContext("  Code   Review  ")).toBe("code review");
  });

  test("preserves already normalized strings", () => {
    expect(normalizeContext("research")).toBe("research");
  });

  test("handles empty string", () => {
    expect(normalizeContext("")).toBe("");
  });
});
