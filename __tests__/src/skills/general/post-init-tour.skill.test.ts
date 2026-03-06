/**
 * Tests for the post-init-tour skill.
 *
 * Covers:
 * - Config validation
 * - Getters (name, description)
 * - Format outputs (Cursor, Claude)
 * - Tour steps content verification
 */

import { describe, test, expect } from "bun:test";

import {
  postInitTourSkill,
  tourSteps,
} from "../../../../src/skills/general/post-init-tour.skill";

// ---- Config Validation ----

describe("postInitTourSkill - config validation", () => {
  test("creates with valid config", () => {
    expect(postInitTourSkill).toBeDefined();
  });

  test("config validates via Zod schema", () => {
    expect(postInitTourSkill.config).toBeDefined();
    expect(postInitTourSkill.config.frontmatter).toBeDefined();
    expect(postInitTourSkill.config.sections.length).toBeGreaterThan(0);
  });
});

// ---- Getters ----

describe("postInitTourSkill - getters", () => {
  test('name returns "post-init-tour"', () => {
    expect(postInitTourSkill.name).toBe("post-init-tour");
  });

  test("description mentions guiding new users", () => {
    expect(postInitTourSkill.description).toContain("Guide new users");
  });
});

// ---- toCursorFormat ----

describe("postInitTourSkill - toCursorFormat", () => {
  test("output includes frontmatter with skill name", () => {
    const output = postInitTourSkill.toCursorFormat();
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("name: post-init-tour");
  });
});

// ---- toClaudeFormat ----

describe("postInitTourSkill - toClaudeFormat", () => {
  test("output starts with H1 heading using the skill name", () => {
    const output = postInitTourSkill.toClaudeFormat();
    expect(output.startsWith("# post-init-tour")).toBe(true);
  });

  test("sections with titles become H2 headings", () => {
    const output = postInitTourSkill.toClaudeFormat();
    expect(output).toContain("## main");
  });
});

// ---- Tour Steps ----

describe("tourSteps", () => {
  test("has at least 7 steps", () => {
    expect(tourSteps.length).toBeGreaterThanOrEqual(7);
  });

  test("every step has a title and content", () => {
    for (const step of tourSteps) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.content.length).toBeGreaterThan(0);
    }
  });

  test("covers BRAIN.md concept", () => {
    const found = tourSteps.some((s) => s.title.includes("BRAIN.md"));
    expect(found).toBe(true);
  });

  test("covers MEMORY.md concept", () => {
    const found = tourSteps.some((s) => s.title.includes("MEMORY.md"));
    expect(found).toBe(true);
  });

  test("covers Skills concept", () => {
    const found = tourSteps.some((s) => s.title.includes("Skills"));
    expect(found).toBe(true);
  });

  test("covers Agents concept", () => {
    const found = tourSteps.some((s) => s.title.includes("Agents"));
    expect(found).toBe(true);
  });

  test("covers Phases concept", () => {
    const found = tourSteps.some((s) => s.title.includes("Phases"));
    expect(found).toBe(true);
  });

  test("covers Rules concept", () => {
    const found = tourSteps.some((s) => s.title.includes("Rules"));
    expect(found).toBe(true);
  });

  test("covers Hooks concept", () => {
    const found = tourSteps.some((s) => s.title.includes("Hooks"));
    expect(found).toBe(true);
  });
});

// ---- Content Verification ----

describe("postInitTourSkill - content verification", () => {
  const output = postInitTourSkill.toClaudeFormat();

  test("mentions BRAIN.md in output", () => {
    expect(output).toContain("BRAIN.md");
  });

  test("mentions MEMORY.md in output", () => {
    expect(output).toContain("MEMORY.md");
  });

  test("mentions ROADMAP.md in output", () => {
    expect(output).toContain("ROADMAP.md");
  });

  test("mentions /phase-plan as next step", () => {
    expect(output).toContain("/phase-plan");
  });

  test("mentions /help command", () => {
    expect(output).toContain("/help");
  });

  test("mentions /progress command", () => {
    expect(output).toContain("/progress");
  });

  test("includes all tour step titles", () => {
    for (const step of tourSteps) {
      expect(output).toContain(step.title);
    }
  });
});
