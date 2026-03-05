/**
 * Tests for the skill eval framework: schema validation, config integration,
 * and eval runner loading.
 */
import { describe, test, expect } from "bun:test";
import { SkillConfigSchema, SkillEvalSchema, skillRegistry } from "~/skills";

// ---------------------------------------------------------------------------
// SkillEvalSchema validation
// ---------------------------------------------------------------------------
describe("SkillEvalSchema", () => {
  test("accepts a valid eval object", () => {
    const result = SkillEvalSchema.safeParse({
      prompt: "Execute phase 5",
      expected: "Plans grouped into waves",
      criteria: ["Respects dependencies", "Spawns sub-agents"],
    });
    expect(result.success).toBe(true);
  });

  test("rejects eval missing prompt", () => {
    const result = SkillEvalSchema.safeParse({
      expected: "something",
      criteria: ["a"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects eval missing expected", () => {
    const result = SkillEvalSchema.safeParse({
      prompt: "Do something",
      criteria: ["a"],
    });
    expect(result.success).toBe(false);
  });

  test("rejects eval missing criteria", () => {
    const result = SkillEvalSchema.safeParse({
      prompt: "Do something",
      expected: "something",
    });
    expect(result.success).toBe(false);
  });

  test("rejects eval with non-array criteria", () => {
    const result = SkillEvalSchema.safeParse({
      prompt: "Do something",
      expected: "something",
      criteria: "not an array",
    });
    expect(result.success).toBe(false);
  });

  test("accepts eval with empty criteria array", () => {
    const result = SkillEvalSchema.safeParse({
      prompt: "Do something",
      expected: "something",
      criteria: [],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SkillConfigSchema with optional evals
// ---------------------------------------------------------------------------
describe("SkillConfigSchema with evals", () => {
  const baseConfig = {
    frontmatter: { name: "test", description: "A test skill" },
    sections: [{ title: "main", content: "body", order: 1 }],
  };

  test("accepts config without evals", () => {
    const result = SkillConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evals).toBeUndefined();
    }
  });

  test("accepts config with empty evals array", () => {
    const result = SkillConfigSchema.safeParse({ ...baseConfig, evals: [] });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evals).toEqual([]);
    }
  });

  test("accepts config with valid evals", () => {
    const result = SkillConfigSchema.safeParse({
      ...baseConfig,
      evals: [
        {
          prompt: "Test prompt",
          expected: "Test expected",
          criteria: ["criterion 1"],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const parsedEvals = result.data.evals ?? [];
      expect(parsedEvals).toHaveLength(1);
      expect(parsedEvals[0]?.prompt).toBe("Test prompt");
    }
  });

  test("rejects config with invalid eval in array", () => {
    const result = SkillConfigSchema.safeParse({
      ...baseConfig,
      evals: [{ prompt: "Missing fields" }],
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Eval runner: registry loading
// ---------------------------------------------------------------------------
describe("Eval runner - skill registry loading", () => {
  test("skill registry contains expected skills with evals", () => {
    const skillsWithEvals: string[] = [];

    for (const [name, factory] of Object.entries(skillRegistry)) {
      const skill = factory();
      if (skill.config.evals && skill.config.evals.length > 0) {
        skillsWithEvals.push(name);
      }
    }

    expect(skillsWithEvals).toContain("phase-execute");
    expect(skillsWithEvals).toContain("git-commit");
    expect(skillsWithEvals).toContain("debug");
  });

  test("phase-execute has 3 evals", () => {
    const factory = skillRegistry["phase-execute"];
    expect(factory).toBeDefined();
    const evals = factory!().config.evals ?? [];
    expect(evals).toHaveLength(3);
  });

  test("git-commit has 3 evals", () => {
    const factory = skillRegistry["git-commit"];
    expect(factory).toBeDefined();
    const evals = factory!().config.evals ?? [];
    expect(evals).toHaveLength(3);
  });

  test("debug has 3 evals", () => {
    const factory = skillRegistry["debug"];
    expect(factory).toBeDefined();
    const evals = factory!().config.evals ?? [];
    expect(evals).toHaveLength(3);
  });

  test("all evals in registry pass schema validation", () => {
    for (const [, factory] of Object.entries(skillRegistry)) {
      const skill = factory();
      const evals = skill.config.evals;
      if (!evals) continue;

      for (const evalCase of evals) {
        const result = SkillEvalSchema.safeParse(evalCase);
        expect(result.success).toBe(true);
      }
    }
  });

  test("skills without evals still load correctly", () => {
    const factory = skillRegistry["help"];
    expect(factory).toBeDefined();
    const skill = factory!();
    expect(skill.config.evals).toBeUndefined();
    expect(skill.name).toBe("help");
  });
});
