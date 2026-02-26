import { describe, test, expect } from "bun:test";
import { repoAuditSkill } from "../../../../src/skills/general/repo-audit.skill";
import { skillRegistry } from "../../../../src/skills/index";

// ---------------------------------------------------------------------------
// Config Validation
// ---------------------------------------------------------------------------
describe("repoAuditSkill - config validation", () => {
  test("creates without error", () => {
    expect(repoAuditSkill).toBeDefined();
  });

  test("config validates via Zod schema", () => {
    expect(repoAuditSkill.config).toBeDefined();
    expect(repoAuditSkill.config.frontmatter).toBeDefined();
    expect(repoAuditSkill.config.sections.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------
describe("repoAuditSkill - getters", () => {
  test('name returns "repo-audit"', () => {
    expect(repoAuditSkill.name).toBe("repo-audit");
  });

  test("description mentions naming violations and convention drift", () => {
    expect(repoAuditSkill.description).toContain("naming violations");
    expect(repoAuditSkill.description).toContain("convention drift");
  });
});

// ---------------------------------------------------------------------------
// toCursorFormat
// ---------------------------------------------------------------------------
describe("repoAuditSkill - toCursorFormat", () => {
  test("output is a non-empty string", () => {
    const output = repoAuditSkill.toCursorFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("output includes frontmatter with skill name", () => {
    const output = repoAuditSkill.toCursorFormat();
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("name: repo-audit");
  });
});

// ---------------------------------------------------------------------------
// toClaudeFormat
// ---------------------------------------------------------------------------
describe("repoAuditSkill - toClaudeFormat", () => {
  test("output is a non-empty string", () => {
    const output = repoAuditSkill.toClaudeFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("output starts with H1 heading using the skill name", () => {
    const output = repoAuditSkill.toClaudeFormat();
    expect(output.startsWith("# repo-audit")).toBe(true);
  });

  test("sections with titles become H2 headings", () => {
    const output = repoAuditSkill.toClaudeFormat();
    expect(output).toContain("## main");
  });
});

// ---------------------------------------------------------------------------
// Content Verification
// ---------------------------------------------------------------------------
describe("repoAuditSkill - content verification", () => {
  const output = repoAuditSkill.toClaudeFormat();

  test("references lu-repo-architect agent", () => {
    expect(output).toContain("lu-repo-architect");
  });

  test("references audit mode flags", () => {
    expect(output).toContain("--quick");
    expect(output).toContain("--full");
    expect(output).toContain("--fix");
  });

  test("references domain boundary check script", () => {
    expect(output).toContain("check-domain-boundaries");
  });

  test("references drift check script", () => {
    expect(output).toContain("check:drift");
  });

  test("contains health report output format", () => {
    expect(output).toContain("REPO HEALTH REPORT");
  });

  test("references complexity levels", () => {
    expect(output).toContain("TRIVIAL");
    expect(output).toContain("SIMPLE");
    expect(output).toContain("MODERATE");
    expect(output).toContain("COMPLEX");
    expect(output).toContain("CRITICAL");
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
describe("repoAuditSkill - registry", () => {
  test("is registered in skillRegistry", () => {
    const factory = skillRegistry["repo-audit"];
    expect(factory).toBeDefined();
    expect(typeof factory).toBe("function");
    const skill = factory!();
    expect(skill.name).toBe("repo-audit");
  });
});
