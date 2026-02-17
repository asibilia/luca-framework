import { describe, test, expect } from "bun:test";
import { ruleRegistry } from "../../../src/rules/index";
import { parserRegistry } from "../../../src/harness/parsers/index";
import path from "path";

const PROJECT_DIR = path.join(import.meta.dir, "../../..");

describe("harness integration", () => {
  test("harness-verification rule is registered", () => {
    expect(ruleRegistry).toHaveProperty("harness-verification");
  });

  test("harness-verification rule can be instantiated", () => {
    const createRule = ruleRegistry["harness-verification"]!;
    const instance = createRule();
    expect(instance).toBeDefined();
  });

  test("parser registry has all 4 parsers", () => {
    expect(parserRegistry).toHaveProperty("bun-test");
    expect(parserRegistry).toHaveProperty("tsc");
    expect(parserRegistry).toHaveProperty("eslint");
    expect(parserRegistry).toHaveProperty("generic");
  });

  test("each parser is a function", () => {
    for (const [name, parser] of Object.entries(parserRegistry)) {
      expect(typeof parser).toBe("function");
    }
  });

  test("project config.json has harness section", async () => {
    const configPath = path.join(PROJECT_DIR, ".planning", "config.json");
    const configFile = Bun.file(configPath);
    const config = await configFile.json();
    expect(config).toHaveProperty("harness");
    expect(config.harness).toHaveProperty("enabled");
    expect(config.harness).toHaveProperty("maxFixIterations");
    expect(config.harness).toHaveProperty("failFast");
    expect(config.harness).toHaveProperty("checks");
    expect(config.harness.checks).toHaveLength(4);
  });

  test("template config.json has harness section", async () => {
    const templateConfigPath = path.join(
      PROJECT_DIR,
      "packages/luca-framework/templates/framework/templates/config.json",
    );
    const configFile = Bun.file(templateConfigPath);
    const config = await configFile.json();
    expect(config).toHaveProperty("harness");
    expect(config.harness).toHaveProperty("enabled");
    expect(config.harness).toHaveProperty("checks");
    expect(config.harness.checks).toHaveLength(4);
  });

  test("template config has build disabled", async () => {
    const templateConfigPath = path.join(
      PROJECT_DIR,
      "packages/luca-framework/templates/framework/templates/config.json",
    );
    const configFile = Bun.file(templateConfigPath);
    const config = await configFile.json();
    const buildCheck = config.harness.checks.find(
      (c: { name: string }) => c.name === "build",
    );
    expect(buildCheck?.enabled).toBe(false);
  });

  test("project config has build enabled", async () => {
    const configPath = path.join(PROJECT_DIR, ".planning", "config.json");
    const configFile = Bun.file(configPath);
    const config = await configFile.json();
    const buildCheck = config.harness.checks.find(
      (c: { name: string }) => c.name === "build",
    );
    expect(buildCheck?.enabled).toBe(true);
  });

  test("harness-verification rule output files exist", async () => {
    const cursorRule = Bun.file(
      path.join(PROJECT_DIR, ".cursor/rules/harness-verification.mdc"),
    );
    const claudeRule = Bun.file(
      path.join(PROJECT_DIR, ".claude/rules/harness-verification.md"),
    );
    expect(await cursorRule.exists()).toBe(true);
    expect(await claudeRule.exists()).toBe(true);
  });
});
