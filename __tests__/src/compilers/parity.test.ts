import { describe, test, expect } from "bun:test";
import {
  checkFormatParity,
  checkContentParity,
  generateParityReport,
} from "../../../src/compilers/__helpers/parity";

// ─── Test Fixtures ──────────────────────────────────────────────────────────

/** Build a minimal output map with consistent entity counts across all formats. */
function makeParityMap(
  agents: string[] = ["lu-executor", "lu-planner"],
  skills: string[] = ["autopilot", "git-commit"],
  rules: string[] = ["api-snake-case"],
): Map<string, string> {
  const map = new Map<string, string>();

  for (const name of agents) {
    map.set(`.claude/agents/${name}.md`, `# ${name} agent (claude)`);
    map.set(`.cursor/agents/${name}.md`, `# ${name} agent (cursor)`);
    map.set(`.pi/agents/${name}.md`, `# ${name} agent (pi)`);
    map.set(`dist/plugin/agents/${name}.md`, `# ${name} agent (plugin)`);
  }

  for (const name of skills) {
    map.set(`.claude/skills/${name}/SKILL.md`, `# ${name} skill (claude)`);
    map.set(`.cursor/skills/${name}/SKILL.md`, `# ${name} skill (cursor)`);
    map.set(`.pi/skills/${name}/SKILL.md`, `# ${name} skill (pi)`);
    map.set(`dist/plugin/skills/${name}/SKILL.md`, `# ${name} skill (plugin)`);
  }

  // Rules only in claude and cursor
  for (const name of rules) {
    map.set(`.claude/rules/${name}.md`, `# ${name} rule (claude)`);
    map.set(`.cursor/rules/${name}.mdc`, `# ${name} rule (cursor)`);
  }

  return map;
}

// ─── R10.1: Format Count Parity ──────────────────────────────────────────────

describe("checkFormatParity", () => {
  test("detects full parity when all formats have equal counts", () => {
    const map = makeParityMap();
    const results = checkFormatParity(map);

    expect(results.length).toBe(3); // agent, skill, rule
    for (const check of results) {
      expect(check.is_parity).toBe(true);
      expect(check.mismatches.length).toBe(0);
    }
  });

  test("detects agent count mismatch when pi is missing an agent", () => {
    const map = makeParityMap();
    // Remove one agent from pi
    map.delete(".pi/agents/lu-planner.md");

    const results = checkFormatParity(map);
    const agentCheck = results.find((r) => r.entity_type === "agent");

    expect(agentCheck!.is_parity).toBe(false);
    expect(agentCheck!.mismatches.length).toBeGreaterThan(0);
    expect(agentCheck!.format_counts["pi"]).toBe(1);
    expect(agentCheck!.format_counts["claude"]).toBe(2);
  });

  test("detects skill count mismatch when plugin is missing a skill", () => {
    const map = makeParityMap();
    map.delete("dist/plugin/skills/git-commit/SKILL.md");

    const results = checkFormatParity(map);
    const skillCheck = results.find((r) => r.entity_type === "skill");

    expect(skillCheck!.is_parity).toBe(false);
    expect(skillCheck!.format_counts["plugin"]).toBe(1);
  });

  test("rule parity checks only claude and cursor (not pi/plugin)", () => {
    const map = makeParityMap();
    const results = checkFormatParity(map);
    const ruleCheck = results.find((r) => r.entity_type === "rule");

    expect(ruleCheck!.is_parity).toBe(true);
    // Only claude and cursor should be counted
    expect(Object.keys(ruleCheck!.format_counts).sort()).toEqual([
      "claude",
      "cursor",
    ]);
  });

  test("handles empty output map gracefully", () => {
    const results = checkFormatParity(new Map());

    expect(results.length).toBe(3);
    for (const check of results) {
      expect(check.is_parity).toBe(true); // all zeros are equal
    }
  });
});

// ─── R10.2-R10.4: Content Parity ────────────────────────────────────────────

describe("checkContentParity", () => {
  test("all entities present in all supported formats", () => {
    const map = makeParityMap();
    const results = checkContentParity(map);

    for (const check of results) {
      expect(check.is_parity).toBe(true);
      expect(check.formats_missing.length).toBe(0);
    }
  });

  test("detects missing agent in one format", () => {
    const map = makeParityMap();
    map.delete(".pi/agents/lu-executor.md");

    const results = checkContentParity(map);
    const executorCheck = results.find(
      (r) => r.entity_name === "lu-executor" && r.entity_type === "agent",
    );

    expect(executorCheck!.is_parity).toBe(false);
    expect(executorCheck!.formats_missing).toContain("pi");
    expect(executorCheck!.formats_present).toContain("claude");
    expect(executorCheck!.formats_present).toContain("cursor");
    expect(executorCheck!.formats_present).toContain("plugin");
  });

  test("detects missing skill in multiple formats", () => {
    const map = makeParityMap();
    map.delete(".cursor/skills/autopilot/SKILL.md");
    map.delete(".pi/skills/autopilot/SKILL.md");

    const results = checkContentParity(map);
    const autopilotCheck = results.find(
      (r) => r.entity_name === "autopilot" && r.entity_type === "skill",
    );

    expect(autopilotCheck!.is_parity).toBe(false);
    expect(autopilotCheck!.formats_missing).toContain("cursor");
    expect(autopilotCheck!.formats_missing).toContain("pi");
  });

  test("rule content parity only checks claude and cursor", () => {
    const map = makeParityMap([], [], ["api-snake-case", "no-classes"]);
    const results = checkContentParity(map);
    const ruleChecks = results.filter((r) => r.entity_type === "rule");

    expect(ruleChecks.length).toBe(2);
    for (const check of ruleChecks) {
      // Each rule should have exactly claude and cursor
      expect(check.formats_present.sort()).toEqual(["claude", "cursor"]);
      expect(check.formats_missing.length).toBe(0);
    }
  });

  test("handles empty output map gracefully", () => {
    const results = checkContentParity(new Map());
    expect(results.length).toBe(0);
  });
});

// ─── R10.5: Parity Report ───────────────────────────────────────────────────

describe("generateParityReport", () => {
  test("reports overall parity when all checks pass", () => {
    const map = makeParityMap();
    const report = generateParityReport(map);

    expect(report.overall_parity).toBe(true);
    expect(report.summary).toContain("parity");
    expect(report.format_parity.length).toBe(3);
    expect(report.timestamp).toBeTruthy();
  });

  test("reports failure when count mismatch exists", () => {
    const map = makeParityMap();
    map.delete(".pi/agents/lu-executor.md");

    const report = generateParityReport(map);

    expect(report.overall_parity).toBe(false);
    expect(report.summary).toContain("failed");
  });

  test("reports failure when content mismatch exists", () => {
    const map = makeParityMap();
    map.delete(".cursor/skills/autopilot/SKILL.md");

    const report = generateParityReport(map);

    expect(report.overall_parity).toBe(false);
    expect(report.summary).toContain("autopilot");
  });

  test("includes content parity details for each entity", () => {
    const map = makeParityMap(["agent-a"], ["skill-a"], ["rule-a"]);
    const report = generateParityReport(map);

    // 1 agent + 1 skill + 1 rule = 3 content checks
    expect(report.content_parity.length).toBe(3);
  });
});
