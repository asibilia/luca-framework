import { describe, test, expect } from "bun:test";
import { sanitizeForTemplate } from "../../../src/shared/__helpers/sanitize-template";

// ---------------------------------------------------------------------------
// sanitizeForTemplate
// ---------------------------------------------------------------------------

describe("sanitizeForTemplate", () => {
  test("strips backticks", () => {
    expect(sanitizeForTemplate("hello `world`")).toBe("hello world");
  });

  test("strips template injection sequences (${...})", () => {
    expect(sanitizeForTemplate("hello ${injected}")).toBe("hello injected}");
  });

  test("replaces newlines with spaces", () => {
    expect(sanitizeForTemplate("line1\nline2\rline3")).toBe(
      "line1 line2 line3",
    );
  });

  test("strips control characters", () => {
    expect(sanitizeForTemplate("hello\x00\x01\x1fworld")).toBe("helloworld");
  });

  test("strips DEL character (0x7f)", () => {
    expect(sanitizeForTemplate("hello\x7fworld")).toBe("helloworld");
  });

  test("passes through normal text unchanged", () => {
    const normal =
      "This is a perfectly normal string with numbers 123 and symbols !@#%^&*()";
    expect(sanitizeForTemplate(normal)).toBe(normal);
  });

  test("handles empty string", () => {
    expect(sanitizeForTemplate("")).toBe("");
  });

  test("handles combined injection patterns", () => {
    const malicious = "`${process.exit(1)}`\n\x00";
    const sanitized = sanitizeForTemplate(malicious);
    expect(sanitized).not.toContain("`");
    expect(sanitized).not.toContain("${");
    expect(sanitized).not.toContain("\n");
    expect(sanitized).not.toContain("\x00");
  });

  test("strips nested template literal attempts", () => {
    expect(sanitizeForTemplate("`${`nested`}`")).toBe("nested}");
  });

  test("preserves Unicode text (non-control characters)", () => {
    expect(sanitizeForTemplate("hello -- world")).toBe("hello -- world");
  });

  test("handles multiple newlines and carriage returns", () => {
    expect(sanitizeForTemplate("a\n\n\r\nb")).toBe("a    b");
  });

  test("handles string with only injection characters", () => {
    expect(sanitizeForTemplate("`${}\n\r\x00")).toBe("}  ");
  });
});
