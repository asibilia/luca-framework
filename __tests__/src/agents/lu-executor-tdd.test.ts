import { describe, test, expect } from "bun:test";
import { luExecutorAgent } from "../../../src/agents/luca/lu-executor.agent";

describe("lu-executor TDD integration", () => {
  const agent = luExecutorAgent;
  const sections = agent.config.sections;

  test("executor agent has tdd_execution_flow section", () => {
    const tddSection = sections.find((s) => s.title === "tdd_execution_flow");
    expect(tddSection).toBeDefined();
  });

  test("executor agent has tdd_retry_loop section", () => {
    const retrySection = sections.find((s) => s.title === "tdd_retry_loop");
    expect(retrySection).toBeDefined();
  });

  test("tdd_execution_flow section contains Red phase instructions", () => {
    const tddSection = sections.find((s) => s.title === "tdd_execution_flow");
    expect(tddSection!.content).toContain("TDD-2");
    expect(tddSection!.content).toContain("RED");
  });

  test("tdd_execution_flow section contains Green phase instructions", () => {
    const tddSection = sections.find((s) => s.title === "tdd_execution_flow");
    expect(tddSection!.content).toContain("TDD-4");
    expect(tddSection!.content).toContain("GREEN");
  });

  test("tdd_execution_flow section references lu-test-writer spawn", () => {
    const tddSection = sections.find((s) => s.title === "tdd_execution_flow");
    expect(tddSection!.content).toContain("lu-test-writer");
    expect(tddSection!.content).toContain("subagent_type");
  });

  test("tdd_retry_loop section contains retry budget reference", () => {
    const retrySection = sections.find((s) => s.title === "tdd_retry_loop");
    expect(retrySection!.content).toContain("harnessFixIterations");
    expect(retrySection!.content).toContain("iteration");
  });

  test("tdd_retry_loop section prohibits modifying test expectations", () => {
    const retrySection = sections.find((s) => s.title === "tdd_retry_loop");
    expect(retrySection!.content).toContain("NEVER modify test");
  });

  test("execution_flow section references TDD flow", () => {
    const execSection = sections.find((s) => s.title === "execution_flow");
    expect(execSection).toBeDefined();
    expect(execSection!.content.toLowerCase()).toContain("tdd");
  });

  test("executor agent validates successfully", () => {
    expect(agent).toBeDefined();
    expect(agent.name).toBe("lu-executor");
  });
});
