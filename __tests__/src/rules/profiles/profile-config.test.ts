import { describe, test, expect } from "bun:test";
import { ProfileConfigSchema } from "../../../../src/rules/profiles/profile.schemas";

describe("ProfileConfigSchema defaults", () => {
  test("defaults opinionated_guidelines to true", () => {
    const result = ProfileConfigSchema.parse({});
    expect(result.opinionated_guidelines).toBe(true);
  });

  test('defaults tech_stack_profiles to ["typescript"]', () => {
    const result = ProfileConfigSchema.parse({});
    expect(result.tech_stack_profiles).toEqual(["typescript"]);
  });

  test("parses explicit values correctly", () => {
    const result = ProfileConfigSchema.parse({
      opinionated_guidelines: false,
      tech_stack_profiles: ["python", "go"],
    });
    expect(result.opinionated_guidelines).toBe(false);
    expect(result.tech_stack_profiles).toEqual(["python", "go"]);
  });
});

describe("ProfileConfigSchema validation", () => {
  test("accepts valid config with all fields", () => {
    const result = ProfileConfigSchema.safeParse({
      opinionated_guidelines: true,
      tech_stack_profiles: ["typescript", "python"],
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty profiles array", () => {
    const result = ProfileConfigSchema.safeParse({
      opinionated_guidelines: true,
      tech_stack_profiles: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tech_stack_profiles).toEqual([]);
    }
  });

  test("rejects non-boolean opinionated_guidelines", () => {
    const result = ProfileConfigSchema.safeParse({
      opinionated_guidelines: "yes",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-array tech_stack_profiles", () => {
    const result = ProfileConfigSchema.safeParse({
      tech_stack_profiles: "typescript",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-string items in tech_stack_profiles", () => {
    const result = ProfileConfigSchema.safeParse({
      tech_stack_profiles: [123, true],
    });
    expect(result.success).toBe(false);
  });

  test("accepts partial config (only opinionated_guidelines)", () => {
    const result = ProfileConfigSchema.safeParse({
      opinionated_guidelines: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opinionated_guidelines).toBe(false);
      expect(result.data.tech_stack_profiles).toEqual(["typescript"]);
    }
  });

  test("accepts partial config (only tech_stack_profiles)", () => {
    const result = ProfileConfigSchema.safeParse({
      tech_stack_profiles: ["rust"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.opinionated_guidelines).toBe(true);
      expect(result.data.tech_stack_profiles).toEqual(["rust"]);
    }
  });

  test("ignores extra fields", () => {
    const result = ProfileConfigSchema.safeParse({
      opinionated_guidelines: true,
      tech_stack_profiles: ["typescript"],
      extra_field: "ignored",
    });
    expect(result.success).toBe(true);
  });
});
