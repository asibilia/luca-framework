import { describe, test, expect } from "bun:test";
import {
  buildDependencyOrder,
  detectConflicts,
  groupParallelBatches,
} from "../../../src/skills/__helpers/dependency-graph";
import type { SkillDependencyMap } from "../../../src/skills/__schemas/skill-dependencies";

// ---------------------------------------------------------------------------
// buildDependencyOrder
// ---------------------------------------------------------------------------

describe("buildDependencyOrder", () => {
  test("returns empty array for empty input", () => {
    const result = buildDependencyOrder({}, []);
    expect(result).toEqual([]);
  });

  test("returns single skill with no dependencies", () => {
    const deps: SkillDependencyMap = {
      deploy: {
        skill_name: "deploy",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    const result = buildDependencyOrder(deps, ["deploy"]);
    expect(result).toEqual(["deploy"]);
  });

  test("produces correct order for linear dependency chain", () => {
    const deps: SkillDependencyMap = {
      build: {
        skill_name: "build",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      test: {
        skill_name: "test",
        required_before: ["build"],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      deploy: {
        skill_name: "deploy",
        required_before: ["test"],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    const result = buildDependencyOrder(deps, ["deploy", "test", "build"]);
    expect(result).toEqual(["build", "test", "deploy"]);
  });

  test("handles blocked_by constraints", () => {
    const deps: SkillDependencyMap = {
      lint: {
        skill_name: "lint",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      test: {
        skill_name: "test",
        required_before: [],
        blocked_by: ["lint"],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    const result = buildDependencyOrder(deps, ["test", "lint"]);
    expect(result).toEqual(["lint", "test"]);
  });

  test("throws on circular dependency", () => {
    const deps: SkillDependencyMap = {
      a: {
        skill_name: "a",
        required_before: ["b"],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      b: {
        skill_name: "b",
        required_before: ["a"],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    expect(() => buildDependencyOrder(deps, ["a", "b"])).toThrow(
      /Circular dependency detected/,
    );
  });

  test("ignores dependencies not in requested set", () => {
    const deps: SkillDependencyMap = {
      build: {
        skill_name: "build",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      test: {
        skill_name: "test",
        required_before: ["build"],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    // Only request "test" without "build" — should not fail
    const result = buildDependencyOrder(deps, ["test"]);
    expect(result).toEqual(["test"]);
  });

  test("handles skills with no entry in deps map", () => {
    const deps: SkillDependencyMap = {};
    const result = buildDependencyOrder(deps, ["unknown"]);
    expect(result).toEqual(["unknown"]);
  });
});

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

describe("detectConflicts", () => {
  test("returns empty array for empty input", () => {
    const result = detectConflicts({}, []);
    expect(result).toEqual([]);
  });

  test("returns empty array when no conflicts exist", () => {
    const deps: SkillDependencyMap = {
      build: {
        skill_name: "build",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      test: {
        skill_name: "test",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    const result = detectConflicts(deps, ["build", "test"]);
    expect(result).toEqual([]);
  });

  test("detects mutually exclusive skills", () => {
    const deps: SkillDependencyMap = {
      format: {
        skill_name: "format",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: ["lint"],
        parallel_safe: true,
      },
      lint: {
        skill_name: "lint",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: ["format"],
        parallel_safe: true,
      },
    };
    const result = detectConflicts(deps, ["format", "lint"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/format.*lint|lint.*format/);
    expect(result[0]).toContain("mutually exclusive");
  });

  test("does not report conflict if exclusive skill is not requested", () => {
    const deps: SkillDependencyMap = {
      format: {
        skill_name: "format",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: ["lint"],
        parallel_safe: true,
      },
      lint: {
        skill_name: "lint",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: ["format"],
        parallel_safe: true,
      },
    };
    const result = detectConflicts(deps, ["format"]);
    expect(result).toEqual([]);
  });

  test("does not duplicate bidirectional conflicts", () => {
    const deps: SkillDependencyMap = {
      a: {
        skill_name: "a",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: ["b"],
        parallel_safe: true,
      },
      b: {
        skill_name: "b",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: ["a"],
        parallel_safe: true,
      },
    };
    const result = detectConflicts(deps, ["a", "b"]);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// groupParallelBatches
// ---------------------------------------------------------------------------

describe("groupParallelBatches", () => {
  test("returns empty array for empty input", () => {
    const result = groupParallelBatches({}, []);
    expect(result).toEqual([]);
  });

  test("groups independent parallel-safe skills into one batch", () => {
    const deps: SkillDependencyMap = {
      a: {
        skill_name: "a",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      b: {
        skill_name: "b",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    const result = groupParallelBatches(deps, ["a", "b"]);
    expect(result).toEqual([["a", "b"]]);
  });

  test("separates skills with dependencies into sequential batches", () => {
    const deps: SkillDependencyMap = {
      build: {
        skill_name: "build",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      test: {
        skill_name: "test",
        required_before: ["build"],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      deploy: {
        skill_name: "deploy",
        required_before: ["test"],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    const result = groupParallelBatches(deps, ["build", "test", "deploy"]);
    expect(result).toEqual([["build"], ["test"], ["deploy"]]);
  });

  test("non-parallel-safe skill gets its own batch", () => {
    const deps: SkillDependencyMap = {
      a: {
        skill_name: "a",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      b: {
        skill_name: "b",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: false,
      },
      c: {
        skill_name: "c",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    // "b" is not parallel-safe, so it should be isolated
    const result = groupParallelBatches(deps, ["a", "b", "c"]);
    // a and c can be together in a batch, but b should be separate
    const bBatch = result.find((batch) => batch.includes("b"));
    expect(bBatch).toHaveLength(1);
  });

  test("respects blocked_by for batch placement", () => {
    const deps: SkillDependencyMap = {
      build: {
        skill_name: "build",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      lint: {
        skill_name: "lint",
        required_before: [],
        blocked_by: [],
        mutually_exclusive: [],
        parallel_safe: true,
      },
      test: {
        skill_name: "test",
        required_before: [],
        blocked_by: ["build"],
        mutually_exclusive: [],
        parallel_safe: true,
      },
    };
    const result = groupParallelBatches(deps, ["build", "lint", "test"]);
    // build and lint in batch 0, test in batch 1
    expect(result[0]).toContain("build");
    expect(result[0]).toContain("lint");
    expect(result[1]).toContain("test");
  });
});
