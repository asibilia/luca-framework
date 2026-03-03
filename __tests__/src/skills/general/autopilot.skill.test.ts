import { describe, test, expect } from "bun:test";
import { autopilotSkill } from "../../../../src/skills/general/autopilot.skill";

// ---------------------------------------------------------------------------
// Config Validation
// ---------------------------------------------------------------------------
describe("autopilotSkill - config validation", () => {
  test("creates with valid config", () => {
    expect(autopilotSkill).toBeDefined();
  });

  test("config validates via Zod schema", () => {
    expect(autopilotSkill.config).toBeDefined();
    expect(autopilotSkill.config.frontmatter).toBeDefined();
    expect(autopilotSkill.config.sections.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Getters
// ---------------------------------------------------------------------------
describe("autopilotSkill - getters", () => {
  test('name returns "autopilot"', () => {
    expect(autopilotSkill.name).toBe("autopilot");
  });

  test("description mentions autonomous orchestration", () => {
    expect(autopilotSkill.description).toContain("Autonomous orchestrator");
  });
});

// ---------------------------------------------------------------------------
// toCursorFormat
// ---------------------------------------------------------------------------
describe("autopilotSkill - toCursorFormat", () => {
  test("output includes frontmatter with skill name", () => {
    const output = autopilotSkill.toCursorFormat();
    expect(output.startsWith("---\n")).toBe(true);
    expect(output).toContain("name: autopilot");
  });

  test("frontmatter includes disable-model-invocation as true", () => {
    const output = autopilotSkill.toCursorFormat();
    expect(output).toContain("disable-model-invocation: true");
  });
});

// ---------------------------------------------------------------------------
// toClaudeFormat
// ---------------------------------------------------------------------------
describe("autopilotSkill - toClaudeFormat", () => {
  test("output starts with H1 heading using the skill name", () => {
    const output = autopilotSkill.toClaudeFormat();
    expect(output.startsWith("# autopilot")).toBe(true);
  });

  test("sections with titles become H2 headings", () => {
    const output = autopilotSkill.toClaudeFormat();
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
describe("autopilotSkill - content verification", () => {
  const output = autopilotSkill.toClaudeFormat();

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

  test("contains level-based execution loop", () => {
    expect(output).toContain("Level-Based Execution Loop");
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
