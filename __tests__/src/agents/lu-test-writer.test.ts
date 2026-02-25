import { describe, test, expect } from "bun:test";
import { luTestWriterAgent } from "../../../src/agents/general/lu-test-writer.agent";
import { agentRegistry } from "../../../src/agents/index";

describe("lu-test-writer agent", () => {
  test("creates without error", () => {
    expect(luTestWriterAgent).toBeDefined();
  });

  test("has correct name", () => {
    expect(luTestWriterAgent.name).toBe("lu-test-writer");
  });

  test("has correct description", () => {
    expect(luTestWriterAgent.description).toContain(
      "test files from plan verification criteria",
    );
  });

  test("has required tools", () => {
    const tools = luTestWriterAgent.config.frontmatter.tools;
    expect(tools).toContain("Read");
    expect(tools).toContain("Write");
    expect(tools).toContain("Bash");
  });

  test("has cognition config", () => {
    const cognition = luTestWriterAgent.config.frontmatter.cognition;
    expect(cognition).toBeDefined();
    expect(cognition!.default_tier).toBe("T1");
  });

  test("has all required sections", () => {
    const sectionTitles = luTestWriterAgent.config.sections.map((s) => s.title);
    expect(luTestWriterAgent.config.sections.length).toBeGreaterThanOrEqual(5);
    expect(sectionTitles).toContain("role");
    expect(sectionTitles).toContain("test_generation_process");
    expect(sectionTitles).toContain("test_patterns");
    expect(sectionTitles).toContain("non_testable_detection");
    expect(sectionTitles).toContain("output_format");
  });

  test("toCursorFormat returns string", () => {
    const output = luTestWriterAgent.toCursorFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("toClaudeFormat returns string", () => {
    const output = luTestWriterAgent.toClaudeFormat();
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("is registered in agentRegistry", () => {
    expect(agentRegistry["lu-test-writer"]).toBeDefined();
    expect(typeof agentRegistry["lu-test-writer"]).toBe("function");
    const instance = agentRegistry["lu-test-writer"]!();
    expect(instance.name).toBe("lu-test-writer");
  });
});
