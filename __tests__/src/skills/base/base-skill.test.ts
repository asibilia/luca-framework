/**
 * Unit tests for createSkill factory function
 *
 * Tests config validation, getters, toCursorFormat, toClaudeFormat,
 * and the optional disable-model-invocation field.
 * Uses createTestSkill wrapper around createSkill.
 */
import { describe, test, expect } from "bun:test";
import { createTestSkill } from "../../../utils/test-entities";
import type { SkillConfig } from "../../../../src/skills/types/skill.types";
import { validSkillConfig } from "../../../utils/fixtures";

// ---------------------------------------------------------------------------
// Config Validation (4 cases)
// ---------------------------------------------------------------------------
describe("createSkill - config validation", () => {
  test("accepts a valid config", () => {
    const skill = createTestSkill(validSkillConfig);
    expect(skill).toBeDefined();
  });

  test("accepts config with disable-model-invocation set to true", () => {
    const config: SkillConfig = {
      frontmatter: {
        name: "disabled",
        description: "Disabled skill",
        "disable-model-invocation": true,
      },
      sections: [{ title: "Sec", content: "body", order: 1 }],
    };
    const skill = createTestSkill(config);
    expect(skill.config.frontmatter["disable-model-invocation"]).toBe(true);
  });

  test("accepts config with disable-model-invocation omitted", () => {
    const config: SkillConfig = {
      frontmatter: { name: "no-flag", description: "No flag skill" },
      sections: [],
    };
    const skill = createTestSkill(config);
    expect(
      skill.config.frontmatter["disable-model-invocation"],
    ).toBeUndefined();
  });

  test("rejects config missing frontmatter.name", () => {
    const config = {
      frontmatter: { description: "Missing name" },
      sections: [],
    };
    expect(() => createTestSkill(config as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Getters (3 cases)
// ---------------------------------------------------------------------------
describe("createSkill - getters", () => {
  test("config getter returns the full validated config", () => {
    const skill = createTestSkill(validSkillConfig);
    expect(skill.config).toEqual(validSkillConfig);
  });

  test("name getter returns frontmatter.name", () => {
    const skill = createTestSkill(validSkillConfig);
    expect(skill.name).toBe("test-skill");
  });

  test("description getter returns frontmatter.description", () => {
    const skill = createTestSkill(validSkillConfig);
    expect(skill.description).toBe("A test skill for unit tests");
  });
});

// ---------------------------------------------------------------------------
// toCursorFormat (2 cases)
// ---------------------------------------------------------------------------
describe("createSkill - toCursorFormat", () => {
  test("output includes frontmatter and section tags", () => {
    const skill = createTestSkill(validSkillConfig);
    const output = skill.toCursorFormat();
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("name: test-skill");
    expect(output).toContain("<instructions>");
    expect(output).toContain("</instructions>");
  });

  test("frontmatter includes disable-model-invocation as boolean", () => {
    const skill = createTestSkill(validSkillConfig);
    const output = skill.toCursorFormat();
    expect(output).toContain("disable-model-invocation: false");
  });
});

// ---------------------------------------------------------------------------
// toClaudeFormat (2 cases)
// ---------------------------------------------------------------------------
describe("createSkill - toClaudeFormat", () => {
  test("output starts with H1 heading using the skill name", () => {
    const skill = createTestSkill(validSkillConfig);
    const output = skill.toClaudeFormat();
    expect(output.startsWith("# test-skill")).toBe(true);
  });

  test("sections with titles become H2 headings", () => {
    const skill = createTestSkill(validSkillConfig);
    const output = skill.toClaudeFormat();
    expect(output).toContain("## Instructions");
    expect(output).toContain("Follow these instructions for the test skill.");
  });
});
