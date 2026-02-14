import { describe, test, expect } from "bun:test";
import { LuTestWriterAgent } from "../../../src/agents/general/lu-test-writer.agent";
import { agentRegistry } from "../../../src/agents/index";

describe("lu-test-writer agent", () => {
  test("instantiates without error", () => {
    expect(() => new LuTestWriterAgent()).not.toThrow();
  });

  test("has correct name", () => {
    const agent = new LuTestWriterAgent();
    expect(agent.name).toBe("lu-test-writer");
  });

  test("has correct description", () => {
    const agent = new LuTestWriterAgent();
    expect(agent.description).toContain(
      "test files from plan verification criteria",
    );
  });

  test("has required tools", () => {
    const agent = new LuTestWriterAgent();
    const tools = agent.config.frontmatter.tools;
    expect(tools).toContain("Read");
    expect(tools).toContain("Write");
    expect(tools).toContain("Bash");
  });

  test("has cognition config", () => {
    const agent = new LuTestWriterAgent();
    const cognition = agent.config.frontmatter.cognition;
    expect(cognition).toBeDefined();
    expect(cognition!.default_tier).toBe("T1");
  });

  test("has all required sections", () => {
    const agent = new LuTestWriterAgent();
    const sectionTitles = agent.config.sections.map((s) => s.title);
    expect(agent.config.sections.length).toBeGreaterThanOrEqual(5);
    expect(sectionTitles).toContain("role");
    expect(sectionTitles).toContain("test_generation_process");
    expect(sectionTitles).toContain("test_patterns");
    expect(sectionTitles).toContain("non_testable_detection");
    expect(sectionTitles).toContain("output_format");
  });

  test("toCursorFormat returns string", () => {
    const agent = new LuTestWriterAgent();
    const output = agent.toCursorFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("toClaudeFormat returns string", () => {
    const agent = new LuTestWriterAgent();
    const output = agent.toClaudeFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("is registered in agentRegistry", () => {
    expect(agentRegistry["lu-test-writer"]).toBeDefined();
    expect(typeof agentRegistry["lu-test-writer"]).toBe("function");
    const instance = agentRegistry["lu-test-writer"]();
    expect(instance.name).toBe("lu-test-writer");
  });
});
