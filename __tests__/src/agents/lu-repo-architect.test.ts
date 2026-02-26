import { describe, test, expect } from "bun:test";
import { luRepoArchitectAgent } from "../../../src/agents/general/lu-repo-architect.agent";
import { agentRegistry } from "../../../src/agents/index";

describe("lu-repo-architect agent", () => {
  test("creates without error", () => {
    expect(luRepoArchitectAgent).toBeDefined();
  });

  test("has correct name", () => {
    expect(luRepoArchitectAgent.name).toBe("lu-repo-architect");
  });

  test("has correct description", () => {
    expect(luRepoArchitectAgent.description).toContain("repository structure");
    expect(luRepoArchitectAgent.description).toContain("naming conventions");
    expect(luRepoArchitectAgent.description).toContain("health metrics");
  });

  test("has required tools", () => {
    const tools = luRepoArchitectAgent.config.frontmatter.tools;
    expect(tools).toContain("Read");
    expect(tools).toContain("Glob");
    expect(tools).toContain("Grep");
    expect(tools).toContain("Bash");
  });

  test("has cognition config", () => {
    const cognition = luRepoArchitectAgent.config.frontmatter.cognition;
    expect(cognition).toBeDefined();
    expect(cognition!.default_tier).toBe("T1");
  });

  test("has all required sections", () => {
    const sectionTitles = luRepoArchitectAgent.config.sections.map(
      (s) => s.title,
    );
    expect(sectionTitles).toContain("role");
  });

  test("role section contains audit levels", () => {
    const roleSection = luRepoArchitectAgent.config.sections.find(
      (s) => s.title === "role",
    );
    expect(roleSection).toBeDefined();
    expect(roleSection!.content).toContain("Quick Audit");
    expect(roleSection!.content).toContain("Standard Audit");
    expect(roleSection!.content).toContain("Full Audit");
  });

  test("role section references existing scripts", () => {
    const roleSection = luRepoArchitectAgent.config.sections.find(
      (s) => s.title === "role",
    );
    expect(roleSection!.content).toContain("check-domain-boundaries");
    expect(roleSection!.content).toContain("check:drift");
  });

  test("role section defines severity levels", () => {
    const roleSection = luRepoArchitectAgent.config.sections.find(
      (s) => s.title === "role",
    );
    expect(roleSection!.content).toContain("ERROR");
    expect(roleSection!.content).toContain("WARN");
    expect(roleSection!.content).toContain("INFO");
  });

  test("toCursorFormat returns non-empty string", () => {
    const output = luRepoArchitectAgent.toCursorFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("toClaudeFormat returns non-empty string", () => {
    const output = luRepoArchitectAgent.toClaudeFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("is registered in agentRegistry", () => {
    const factory = agentRegistry["lu-repo-architect"];
    expect(factory).toBeDefined();
    expect(typeof factory).toBe("function");
    const agent = factory!();
    expect(agent.name).toBe("lu-repo-architect");
  });
});
