import { describe, test, expect } from "bun:test";
import { PhaseDiscussSkill } from "../../../src/skills/general/phase-discuss.skill";

describe("phase-discuss --auto mode", () => {
  const skill = new PhaseDiscussSkill();
  const mainSection = skill.config.sections.find((s) => s.title === "main");

  test("skill accepts --auto flag in arguments", () => {
    expect(mainSection!.content).toContain("--auto");
  });

  test("skill documents auto mode flow", () => {
    expect(mainSection!.content).toContain("Auto Mode");
    expect(mainSection!.content).toContain("lu-discuss-researcher");
  });

  test("auto mode auto-selects all gray areas", () => {
    expect(mainSection!.content).toContain("Auto-select ALL gray areas");
  });

  test("auto mode reads BRAIN.md for tech stack", () => {
    expect(mainSection!.content).toContain("BRAIN.md");
  });

  test("auto mode presents research summary with citations", () => {
    expect(mainSection!.content).toContain("research summary");
    expect(mainSection!.content).toContain("citations");
  });

  test("auto mode offers user override", () => {
    expect(mainSection!.content).toContain("user override");
    expect(mainSection!.content.toLowerCase()).toContain("accept all");
    expect(mainSection!.content.toLowerCase()).toContain("override some");
  });

  test("auto mode annotates CONTEXT.md with provenance", () => {
    expect(mainSection!.content).toContain("[researched]");
    expect(mainSection!.content).toContain("[user-override]");
    expect(mainSection!.content).toContain("[user-input]");
  });

  test("interactive mode is preserved when no --auto flag", () => {
    expect(mainSection!.content).toContain("Interactive Mode");
    expect(mainSection!.content).toContain("Deep-dive each selected area");
  });

  test("skill still compiles and validates", () => {
    expect(() => new PhaseDiscussSkill()).not.toThrow();
  });
});
