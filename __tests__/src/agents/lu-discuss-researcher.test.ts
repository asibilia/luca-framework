import { describe, test, expect } from "bun:test";
import { luDiscussResearcherAgent } from "../../../src/agents/general/lu-discuss-researcher.agent";
import { agentRegistry } from "../../../src/agents/index";

describe("lu-discuss-researcher agent", () => {
  test("creates without error", () => {
    expect(luDiscussResearcherAgent).toBeDefined();
  });

  test("has correct name", () => {
    expect(luDiscussResearcherAgent.name).toBe("lu-discuss-researcher");
  });

  test("has correct description", () => {
    expect(luDiscussResearcherAgent.description).toContain(
      "gray area question",
    );
    expect(luDiscussResearcherAgent.description).toContain("phase-discuss");
  });

  test("has web research tools", () => {
    const tools = luDiscussResearcherAgent.config.frontmatter.tools;
    expect(tools).toContain("WebSearch");
    expect(tools).toContain("WebFetch");
    expect(tools).toContain("Read");
  });

  test("has cognition config", () => {
    const cognition = luDiscussResearcherAgent.config.frontmatter.cognition;
    expect(cognition).toBeDefined();
    expect(cognition!.default_tier).toBe("T1");
  });

  test("has all required sections", () => {
    const sectionTitles = luDiscussResearcherAgent.config.sections.map(
      (s) => s.title,
    );
    expect(sectionTitles).toContain("role");
    expect(sectionTitles).toContain("research_protocol");
    expect(sectionTitles).toContain("output_format");
    expect(sectionTitles).toContain("guardrails");
  });

  test("role section references BRAIN.md for tech stack scoping", () => {
    const roleSection = luDiscussResearcherAgent.config.sections.find(
      (s) => s.title === "role",
    );
    expect(roleSection!.content).toContain("BRAIN.md");
    expect(roleSection!.content).toContain("tech stack");
  });

  test("output_format section includes citation structure", () => {
    const outputSection = luDiscussResearcherAgent.config.sections.find(
      (s) => s.title === "output_format",
    );
    expect(outputSection!.content).toContain("Sources:");
    expect(outputSection!.content).toContain("Confidence:");
    expect(outputSection!.content).toContain("HIGH");
    expect(outputSection!.content).toContain("MEDIUM");
    expect(outputSection!.content).toContain("LOW");
  });

  test("guardrails section handles non-researchable questions", () => {
    const guardrailsSection = luDiscussResearcherAgent.config.sections.find(
      (s) => s.title === "guardrails",
    );
    expect(guardrailsSection!.content).toContain("researchable: false");
    expect(guardrailsSection!.content).toContain("Non-Researchable");
  });

  test("toCursorFormat returns string", () => {
    const cursor = luDiscussResearcherAgent.toCursorFormat();
    expect(typeof cursor).toBe("string");
    expect(cursor.length).toBeGreaterThan(0);
  });

  test("toClaudeFormat returns string", () => {
    const claude = luDiscussResearcherAgent.toClaudeFormat();
    expect(typeof claude).toBe("string");
    expect(claude.length).toBeGreaterThan(0);
  });

  test("is registered in agentRegistry", () => {
    const factory = agentRegistry["lu-discuss-researcher"];
    expect(factory).toBeDefined();
    expect(typeof factory).toBe("function");
    const agent = factory!();
    expect(agent.name).toBe("lu-discuss-researcher");
  });
});
