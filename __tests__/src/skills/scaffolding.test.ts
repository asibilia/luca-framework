import { describe, test, expect } from "bun:test";
import {
  classifySkill,
  scaffoldSkillSet,
  skillClassificationSchema,
  skillProfileSchema,
  scaffoldResultSchema,
} from "../../../src/skills/__helpers/scaffolding";

// ─── Core skill names from the registry ────────────────────────────────────────

const CORE_SKILLS = [
  "git-commit",
  "phase-execute",
  "phase-plan",
  "progress",
  "lu",
  "autopilot",
];

const EXTENDED_SKILLS = [
  "debug",
  "help",
  "verify",
  "quick",
  "note",
  "git-pr",
  "git-feature",
  "code-lint",
  "code-typecheck",
  "phase-add",
  "phase-remove",
  "jira-issue",
  "todo-add",
  "todo-check",
  "repo-audit",
  "session-pause",
  "session-resume",
];

const ALL_SKILLS = [...CORE_SKILLS, ...EXTENDED_SKILLS];

// ─── classifySkill ─────────────────────────────────────────────────────────────

describe("classifySkill", () => {
  test("classifies core skills correctly", () => {
    for (const name of CORE_SKILLS) {
      expect(classifySkill(name)).toBe("core");
    }
  });

  test("classifies extended skills correctly", () => {
    for (const name of EXTENDED_SKILLS) {
      expect(classifySkill(name)).toBe("extended");
    }
  });

  test("unknown skills default to extended", () => {
    expect(classifySkill("unknown-skill")).toBe("extended");
    expect(classifySkill("custom-workflow")).toBe("extended");
  });
});

// ─── scaffoldSkillSet ──────────────────────────────────────────────────────────

describe("scaffoldSkillSet", () => {
  test("minimal profile returns only core skills", () => {
    const result = scaffoldSkillSet("minimal", ALL_SKILLS);

    expect(result.profile).toBe("minimal");
    expect(result.core_count).toBe(CORE_SKILLS.length);
    expect(result.extended_count).toBe(0);
    expect(result.skills.length).toBe(CORE_SKILLS.length);

    for (const name of CORE_SKILLS) {
      expect(result.skills).toContain(name);
    }
    for (const name of EXTENDED_SKILLS) {
      expect(result.skills).not.toContain(name);
    }
  });

  test("standard profile returns all skills", () => {
    const result = scaffoldSkillSet("standard", ALL_SKILLS);

    expect(result.profile).toBe("standard");
    expect(result.core_count).toBe(CORE_SKILLS.length);
    expect(result.extended_count).toBe(EXTENDED_SKILLS.length);
    expect(result.skills.length).toBe(ALL_SKILLS.length);
  });

  test("full profile returns all skills", () => {
    const result = scaffoldSkillSet("full", ALL_SKILLS);

    expect(result.profile).toBe("full");
    expect(result.skills.length).toBe(ALL_SKILLS.length);
  });

  test("handles empty skill list", () => {
    const result = scaffoldSkillSet("minimal", []);

    expect(result.skills).toEqual([]);
    expect(result.core_count).toBe(0);
    expect(result.extended_count).toBe(0);
  });

  test("handles list with only core skills", () => {
    const result = scaffoldSkillSet("standard", CORE_SKILLS);

    expect(result.core_count).toBe(CORE_SKILLS.length);
    expect(result.extended_count).toBe(0);
    expect(result.skills.length).toBe(CORE_SKILLS.length);
  });

  test("handles list with only extended skills", () => {
    const result = scaffoldSkillSet("minimal", EXTENDED_SKILLS);

    // No core skills in the input means minimal returns nothing
    expect(result.core_count).toBe(0);
    expect(result.skills.length).toBe(0);
  });

  test("result conforms to scaffoldResultSchema", () => {
    const result = scaffoldSkillSet("standard", ALL_SKILLS);
    const parsed = scaffoldResultSchema.safeParse(result);

    expect(parsed.success).toBe(true);
  });
});

// ─── Schema validation ─────────────────────────────────────────────────────────

describe("schemas", () => {
  test("skillClassificationSchema validates correctly", () => {
    expect(skillClassificationSchema.safeParse("core").success).toBe(true);
    expect(skillClassificationSchema.safeParse("extended").success).toBe(true);
    expect(skillClassificationSchema.safeParse("unknown").success).toBe(false);
  });

  test("skillProfileSchema validates correctly", () => {
    expect(skillProfileSchema.safeParse("minimal").success).toBe(true);
    expect(skillProfileSchema.safeParse("standard").success).toBe(true);
    expect(skillProfileSchema.safeParse("full").success).toBe(true);
    expect(skillProfileSchema.safeParse("custom").success).toBe(false);
  });
});
