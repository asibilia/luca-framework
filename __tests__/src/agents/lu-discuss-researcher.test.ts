import { describe, test, expect } from "bun:test";
import { LuDiscussResearcherAgent } from "../../../src/agents/general/lu-discuss-researcher.agent";
import { agentRegistry } from "../../../src/agents/index";

describe("lu-discuss-researcher agent", () => {
  test("instantiates without error", () => {
    expect(() => new LuDiscussResearcherAgent()).not.toThrow();
  });

  test("has correct name", () => {
    const agent = new LuDiscussResearcherAgent();
    expect(agent.name).toBe("lu-discuss-researcher");
  });

  test("has correct description", () => {
    const agent = new LuDiscussResearcherAgent();
    expect(agent.description).toContain("gray area question");
    expect(agent.description).toContain("phase-discuss");
  });

  test("has web research tools", () => {
    const agent = new LuDiscussResearcherAgent();
    const tools = agent.config.frontmatter.tools;
    expect(tools).toContain("WebSearch");
    expect(tools).toContain("WebFetch");
    expect(tools).toContain("Read");
  });

  test("has cognition config", () => {
    const agent = new LuDiscussResearcherAgent();
    const cognition = agent.config.frontmatter.cognition;
    expect(cognition).toBeDefined();
    expect(cognition!.default_tier).toBe("T1");
  });

  test("has all required sections", () => {
    const agent = new LuDiscussResearcherAgent();
    const sectionTitles = agent.config.sections.map((s) => s.title);
    expect(sectionTitles).toContain("role");
    expect(sectionTitles).toContain("research_protocol");
    expect(sectionTitles).toContain("output_format");
    expect(sectionTitles).toContain("guardrails");
  });

  test("role section references BRAIN.md for tech stack scoping", () => {
    const agent = new LuDiscussResearcherAgent();
    const roleSection = agent.config.sections.find((s) => s.title === "role");
    expect(roleSection!.content).toContain("BRAIN.md");
    expect(roleSection!.content).toContain("tech stack");
  });

  test("output_format section includes citation structure", () => {
    const agent = new LuDiscussResearcherAgent();
    const outputSection = agent.config.sections.find(
      (s) => s.title === "output_format",
    );
    expect(outputSection!.content).toContain("Sources:");
    expect(outputSection!.content).toContain("Confidence:");
    expect(outputSection!.content).toContain("HIGH");
    expect(outputSection!.content).toContain("MEDIUM");
    expect(outputSection!.content).toContain("LOW");
  });

  test("guardrails section handles non-researchable questions", () => {
    const agent = new LuDiscussResearcherAgent();
    const guardrailsSection = agent.config.sections.find(
      (s) => s.title === "guardrails",
    );
    expect(guardrailsSection!.content).toContain("researchable: false");
    expect(guardrailsSection!.content).toContain("Non-Researchable");
  });

  test("toCursorFormat returns string", () => {
    const agent = new LuDiscussResearcherAgent();
    const cursor = agent.toCursorFormat();
    expect(typeof cursor).toBe("string");
    expect(cursor.length).toBeGreaterThan(0);
  });

  test("toClaudeFormat returns string", () => {
    const agent = new LuDiscussResearcherAgent();
    const claude = agent.toClaudeFormat();
    expect(typeof claude).toBe("string");
    expect(claude.length).toBeGreaterThan(0);
  });

  test("is registered in agentRegistry", () => {
    const factory = agentRegistry["lu-discuss-researcher"];
    expect(factory).toBeDefined();
    expect(typeof factory).toBe("function");
    const agent = factory();
    expect(agent.name).toBe("lu-discuss-researcher");
  });
});
