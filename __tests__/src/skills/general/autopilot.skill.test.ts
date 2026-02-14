import { describe, test, expect } from "bun:test";
import { AutopilotSkill } from "../../../../src/skills/general/autopilot.skill";

// ---------------------------------------------------------------------------
// Constructor Validation
// ---------------------------------------------------------------------------
describe("AutopilotSkill - constructor validation", () => {
  test("creates with valid config", () => {
    const skill = new AutopilotSkill();
    expect(skill).toBeDefined();
  });

  test("config validates via Zod schema", () => {
    const skill = new AutopilotSkill();
    expect(skill.config).toBeDefined();
    expect(skill.config.frontmatter).toBeDefined();
    expect(skill.config.sections.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------
describe("AutopilotSkill - getters", () => {
  test('name returns "autopilot"', () => {
    const skill = new AutopilotSkill();
    expect(skill.name).toBe("autopilot");
  });

  test("description mentions autonomous orchestration", () => {
    const skill = new AutopilotSkill();
    expect(skill.description).toContain("Autonomous orchestrator");
  });
});

// ---------------------------------------------------------------------------
// toCursorFormat
// ---------------------------------------------------------------------------
describe("AutopilotSkill - toCursorFormat", () => {
  test("output includes frontmatter with skill name", () => {
    const skill = new AutopilotSkill();
    const output = skill.toCursorFormat();
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("name: autopilot");
  });

  test("frontmatter includes disable-model-invocation as true", () => {
    const skill = new AutopilotSkill();
    const output = skill.toCursorFormat();
    expect(output).toContain("disable-model-invocation: true");
  });
});

// ---------------------------------------------------------------------------
// toClaudeFormat
// ---------------------------------------------------------------------------
describe("AutopilotSkill - toClaudeFormat", () => {
  test("output starts with H1 heading using the skill name", () => {
    const skill = new AutopilotSkill();
    const output = skill.toClaudeFormat();
    expect(output.startsWith("# autopilot")).toBe(true);
  });

  test("sections with titles become H2 headings", () => {
    const skill = new AutopilotSkill();
    const output = skill.toClaudeFormat();
    expect(output).toContain("## main");
    expect(output).toContain("## configuration");
    expect(output).toContain("## backlog_scan");
    expect(output).toContain("## phase_loop");
    expect(output).toContain("## oversight_gates");
  });
});

// ---------------------------------------------------------------------------
// Content Verification
// ---------------------------------------------------------------------------
describe("AutopilotSkill - content verification", () => {
  const skill = new AutopilotSkill();
  const output = skill.toClaudeFormat();

  test("references phase-plan sub-skill", () => {
    expect(output).toContain("phase-plan");
  });

  test("references phase-execute sub-skill", () => {
    expect(output).toContain("phase-execute");
  });

  test("references phase-discuss sub-skill", () => {
    expect(output).toContain("phase-discuss");
  });

  test("references lu-pm-planner agent", () => {
    expect(output).toContain("lu-pm-planner");
  });

  test("references lu-router agent", () => {
    expect(output).toContain("lu-router");
  });

  test("references lu-cognition agent", () => {
    expect(output).toContain("lu-cognition");
  });

  test("references milestone-complete sub-skill", () => {
    expect(output).toContain("milestone-complete");
  });

  test("contains all four oversight levels", () => {
    expect(output).toContain("full-auto");
    expect(output).toContain("flagged");
    expect(output).toContain("milestone");
    // "phase" is too generic to test alone, but it appears in the oversight table
    expect(output).toContain("--oversight=flagged|milestone|phase|full-auto");
  });

  test("contains backlog scan section", () => {
    expect(output).toContain("Backlog Scan");
    expect(output).toContain("Unplanned Detection");
  });

  test("contains roadmap revision section", () => {
    expect(output).toContain("Roadmap Revision");
    expect(output).toContain("WSJF");
  });

  test("contains phase execution loop", () => {
    expect(output).toContain("Phase Execution Loop");
    expect(output).toContain("Dependency Check");
    expect(output).toContain("Complexity Classification");
  });

  test("contains park-and-continue strategy", () => {
    expect(output).toContain("PARKED_PHASES");
    expect(output).toContain("Park-and-Continue");
  });

  test("contains dry-run flag", () => {
    expect(output).toContain("--dry-run");
  });

  test("contains max-phases flag", () => {
    expect(output).toContain("--max-phases");
  });

  test("contains milestone boundary handling", () => {
    expect(output).toContain("Milestone Boundary");
    expect(output).toContain("CROSS_MILESTONE");
  });

  test("contains session summary section", () => {
    expect(output).toContain("SESSION COMPLETE");
    expect(output).toContain("Recommended Next Steps");
  });
});
