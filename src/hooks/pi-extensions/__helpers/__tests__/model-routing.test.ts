import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import {
  resolveAgentModel,
  readComplexityLevel,
  getModelTier,
  MODEL_TIER_TO_MODEL,
  COMPLEXITY_DEFAULT_MODEL,
} from "../model-routing";

import type { AgentFrontmatter } from "../frontmatter";

/**
 * Create a temporary project directory with .planning/STATE.md.
 *
 * @param complexity - Complexity level to write, or null for no STATE.md
 * @returns Path to temp directory (caller must clean up)
 */
function createTempProject(complexity: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), "model-routing-test-"));
  if (complexity !== null) {
    const planningDir = join(dir, ".planning");
    mkdirSync(planningDir, { recursive: true });
    writeFileSync(
      join(planningDir, "STATE.md"),
      `# Project State\n\nTask Complexity: ${complexity}\n`,
    );
  }
  return dir;
}

describe("model-routing helpers", () => {
  describe("MODEL_TIER_TO_MODEL mapping", () => {
    test("fast maps to gemini-3-flash-preview", () => {
      expect(MODEL_TIER_TO_MODEL["fast"]).toBe("gemini-3-flash-preview");
    });

    test("balanced maps to gemini-3.1-pro-preview", () => {
      expect(MODEL_TIER_TO_MODEL["balanced"]).toBe("gemini-3.1-pro-preview");
    });

    test("capable maps to gemini-3.1-pro-preview", () => {
      expect(MODEL_TIER_TO_MODEL["capable"]).toBe("gemini-3.1-pro-preview");
    });
  });

  describe("COMPLEXITY_DEFAULT_MODEL mapping", () => {
    test("TRIVIAL defaults to gemini-3-flash-preview", () => {
      expect(COMPLEXITY_DEFAULT_MODEL["TRIVIAL"]).toBe(
        "gemini-3-flash-preview",
      );
    });

    test("SIMPLE defaults to gemini-3-flash-preview", () => {
      expect(COMPLEXITY_DEFAULT_MODEL["SIMPLE"]).toBe("gemini-3-flash-preview");
    });

    test("MODERATE defaults to gemini-3.1-pro-preview", () => {
      expect(COMPLEXITY_DEFAULT_MODEL["MODERATE"]).toBe(
        "gemini-3.1-pro-preview",
      );
    });

    test("COMPLEX defaults to gemini-3.1-pro-preview", () => {
      expect(COMPLEXITY_DEFAULT_MODEL["COMPLEX"]).toBe(
        "gemini-3.1-pro-preview",
      );
    });

    test("CRITICAL defaults to gemini-3.1-pro-preview", () => {
      expect(COMPLEXITY_DEFAULT_MODEL["CRITICAL"]).toBe(
        "gemini-3.1-pro-preview",
      );
    });
  });

  describe("readComplexityLevel", () => {
    test("reads complexity from STATE.md", () => {
      const dir = createTempProject("COMPLEX");
      try {
        expect(readComplexityLevel(dir)).toBe("COMPLEX");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("reads bold format complexity", () => {
      const dir = mkdtempSync(join(tmpdir(), "model-routing-test-"));
      const planningDir = join(dir, ".planning");
      mkdirSync(planningDir, { recursive: true });
      writeFileSync(
        join(planningDir, "STATE.md"),
        "# State\n\n**Task Complexity:** CRITICAL\n",
      );
      try {
        expect(readComplexityLevel(dir)).toBe("CRITICAL");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("defaults to MODERATE when STATE.md missing", () => {
      const dir = mkdtempSync(join(tmpdir(), "model-routing-test-"));
      try {
        expect(readComplexityLevel(dir)).toBe("MODERATE");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("defaults to MODERATE for invalid complexity value", () => {
      const dir = mkdtempSync(join(tmpdir(), "model-routing-test-"));
      const planningDir = join(dir, ".planning");
      mkdirSync(planningDir, { recursive: true });
      writeFileSync(
        join(planningDir, "STATE.md"),
        "# State\n\nTask Complexity: INVALID_LEVEL\n",
      );
      try {
        expect(readComplexityLevel(dir)).toBe("MODERATE");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("is case-insensitive for complexity parsing", () => {
      const dir = createTempProject("critical");
      try {
        expect(readComplexityLevel(dir)).toBe("CRITICAL");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("resolveAgentModel — 5-step priority chain", () => {
    test("priority 1: explicit model override wins over everything", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
        model: "gemini-3.1-pro-preview",
        model_tier: "capable",
      };
      const dir = createTempProject("CRITICAL");
      try {
        expect(resolveAgentModel(fm, dir, "gemini-3-flash-preview")).toBe(
          "gemini-3-flash-preview",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("priority 2: agent frontmatter model wins when no explicit override", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
        model: "gemini-3.1-pro-preview",
        model_tier: "fast",
      };
      const dir = createTempProject("TRIVIAL");
      try {
        expect(resolveAgentModel(fm, dir)).toBe("gemini-3.1-pro-preview");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("priority 3: model_tier mapping wins when no explicit model", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
        model_tier: "capable",
      };
      const dir = createTempProject("TRIVIAL");
      try {
        expect(resolveAgentModel(fm, dir)).toBe("gemini-3.1-pro-preview");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("priority 3: fast tier maps to gemini-3-flash-preview", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
        model_tier: "fast",
      };
      const dir = createTempProject("CRITICAL");
      try {
        expect(resolveAgentModel(fm, dir)).toBe("gemini-3-flash-preview");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("priority 3: balanced tier maps to gemini-3.1-pro-preview", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
        model_tier: "balanced",
      };
      const dir = createTempProject("TRIVIAL");
      try {
        expect(resolveAgentModel(fm, dir)).toBe("gemini-3.1-pro-preview");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("priority 4: complexity default when no agent config", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
      };
      const dir = createTempProject("CRITICAL");
      try {
        expect(resolveAgentModel(fm, dir)).toBe("gemini-3.1-pro-preview");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("priority 4: TRIVIAL complexity defaults to gemini-3-flash-preview", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
      };
      const dir = createTempProject("TRIVIAL");
      try {
        expect(resolveAgentModel(fm, dir)).toBe("gemini-3-flash-preview");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("priority 5: universal fallback is gemini-3.1-pro-preview when null frontmatter", () => {
      const dir = createTempProject(null);
      try {
        expect(resolveAgentModel(null, dir)).toBe("gemini-3.1-pro-preview");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    test("rejects invalid explicit model (falls to next priority)", () => {
      const fm: AgentFrontmatter = {
        name: "test",
        description: "test",
        tools: [],
        model_tier: "fast",
      };
      const dir = createTempProject("MODERATE");
      try {
        expect(resolveAgentModel(fm, dir, "invalid-model")).toBe(
          "gemini-3-flash-preview",
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("getModelTier", () => {
    test("gemini-3-flash-preview returns fast", () => {
      expect(getModelTier("gemini-3-flash-preview")).toBe("fast");
    });

    test("gemini-3.1-pro-preview returns balanced", () => {
      expect(getModelTier("gemini-3.1-pro-preview")).toBe("balanced");
    });

    test("unknown model returns balanced", () => {
      expect(getModelTier("unknown")).toBe("balanced");
    });
  });
});
