import { test, expect, describe } from "bun:test";
import { skillRegistry } from "../../src/skills/index";
import { agentRegistry } from "../../src/agents/index";
import { SKILL_CATEGORIES, AGENT_CATEGORIES } from "../../scripts/build-shared";

describe("category staleness", () => {
  describe("SKILL_CATEGORIES", () => {
    test("every skill in the registry has a category mapping", () => {
      const missing: string[] = [];
      for (const skillName of Object.keys(skillRegistry)) {
        if (!(skillName in SKILL_CATEGORIES)) {
          missing.push(skillName);
        }
      }
      expect(missing).toEqual([]);
    });

    test("every category key maps to a registered skill", () => {
      const registryKeys = new Set(Object.keys(skillRegistry));
      const stale: string[] = [];
      for (const key of Object.keys(SKILL_CATEGORIES)) {
        if (!registryKeys.has(key)) {
          stale.push(key);
        }
      }
      expect(stale).toEqual([]);
    });
  });

  describe("AGENT_CATEGORIES", () => {
    test("every agent in the registry has a category mapping", () => {
      const missing: string[] = [];
      for (const agentName of Object.keys(agentRegistry)) {
        if (!(agentName in AGENT_CATEGORIES)) {
          missing.push(agentName);
        }
      }
      expect(missing).toEqual([]);
    });

    test("every category key maps to a registered agent", () => {
      const registryKeys = new Set(Object.keys(agentRegistry));
      const stale: string[] = [];
      for (const key of Object.keys(AGENT_CATEGORIES)) {
        if (!registryKeys.has(key)) {
          stale.push(key);
        }
      }
      expect(stale).toEqual([]);
    });
  });
});
