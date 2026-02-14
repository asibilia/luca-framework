import { test, expect, describe } from "bun:test";
import { readdir } from "fs/promises";
import path from "path";
import { ruleRegistry } from "../../../src/rules/index";
import type { BaseRule } from "../../../src/rules/types/rule.types";

const RULES_ROOT = path.join(import.meta.dir, "../../../src/rules");
const GENERAL_RULES_DIR = path.join(RULES_ROOT, "general");

describe("rule registry completeness", () => {
  test("has entry for every source file in src/rules/general/ and root", async () => {
    // General rules
    const generalFiles = await readdir(GENERAL_RULES_DIR);
    const generalRules = generalFiles
      .filter((f) => f.endsWith(".rule.ts"))
      .map((f) => f.replace(".rule.ts", ""));

    // Root-level rules (e.g., lu-workflow.rule.ts)
    const rootFiles = await readdir(RULES_ROOT);
    const rootRules = rootFiles
      .filter((f) => f.endsWith(".rule.ts"))
      .map((f) => f.replace(".rule.ts", ""));

    const allRules = [...generalRules, ...rootRules];

    for (const ruleName of allRules) {
      expect(ruleRegistry).toHaveProperty(ruleName);
    }
  });

  test("has no extra entries beyond source files", async () => {
    const generalFiles = await readdir(GENERAL_RULES_DIR);
    const generalRules = generalFiles
      .filter((f) => f.endsWith(".rule.ts"))
      .map((f) => f.replace(".rule.ts", ""));

    const rootFiles = await readdir(RULES_ROOT);
    const rootRules = rootFiles
      .filter((f) => f.endsWith(".rule.ts"))
      .map((f) => f.replace(".rule.ts", ""));

    const allRules = [...generalRules, ...rootRules];

    const registryKeys = Object.keys(ruleRegistry);
    for (const key of registryKeys) {
      expect(allRules).toContain(key);
    }
  });

  test("registry size matches source file count", async () => {
    const generalFiles = await readdir(GENERAL_RULES_DIR);
    const generalRules = generalFiles
      .filter((f) => f.endsWith(".rule.ts"))
      .map((f) => f.replace(".rule.ts", ""));

    const rootFiles = await readdir(RULES_ROOT);
    const rootRules = rootFiles
      .filter((f) => f.endsWith(".rule.ts"))
      .map((f) => f.replace(".rule.ts", ""));

    const expectedCount = generalRules.length + rootRules.length;
    expect(Object.keys(ruleRegistry).length).toBe(expectedCount);
  });

  test("every entry can be instantiated", () => {
    for (const [_ruleName, RuleClass] of Object.entries(ruleRegistry)) {
      const instance = new (RuleClass as new () => BaseRule)();
      expect(instance).toBeDefined();
      expect(instance.description).toBeDefined();
      expect(typeof instance.description).toBe("string");
    }
  });
});
