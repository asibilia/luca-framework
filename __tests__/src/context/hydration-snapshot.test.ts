import { describe, test, expect } from "bun:test";

import {
  fileTreeSnapshot,
  discoverTestFiles,
  recentGitHistory,
  extractImportGraph,
  complexityToHydrationConfig,
  generatePreFlightSnapshot,
} from "../../../src/context/__helpers/hydration-snapshot";

import {
  fileTreeEntrySchema,
  gitCommitSummarySchema,
  importEdgeSchema,
  preFlightSnapshotSchema,
  hydrationConfigSchema,
} from "../../../src/context/__schemas/context.schemas";

const PROJECT_ROOT = process.cwd();

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe("hydration schemas", () => {
  test("hydrationConfigSchema parses defaults", () => {
    const result = hydrationConfigSchema.parse({});
    expect(result.file_tree_depth).toBe(3);
    expect(result.include_tests).toBe(false);
    expect(result.git_history_count).toBe(10);
    expect(result.include_imports).toBe(false);
  });

  test("hydrationConfigSchema rejects invalid depth", () => {
    const result = hydrationConfigSchema.safeParse({ file_tree_depth: 0 });
    expect(result.success).toBe(false);
  });

  test("hydrationConfigSchema rejects depth > 10", () => {
    const result = hydrationConfigSchema.safeParse({ file_tree_depth: 11 });
    expect(result.success).toBe(false);
  });

  test("fileTreeEntrySchema validates blob entry", () => {
    const result = fileTreeEntrySchema.parse({
      path: "src/context/index.ts",
      type: "blob",
    });
    expect(result.type).toBe("blob");
  });

  test("fileTreeEntrySchema validates tree entry", () => {
    const result = fileTreeEntrySchema.parse({
      path: "src/context",
      type: "tree",
    });
    expect(result.type).toBe("tree");
  });

  test("gitCommitSummarySchema validates commit", () => {
    const result = gitCommitSummarySchema.parse({
      hash: "abc1234",
      subject: "feat: add feature",
      author: "Developer",
      date: "2026-03-01T12:00:00Z",
    });
    expect(result.hash).toBe("abc1234");
  });

  test("importEdgeSchema validates edge", () => {
    const result = importEdgeSchema.parse({
      source: "src/context/index.ts",
      target: "src/context/__schemas/context.schemas",
    });
    expect(result.source).toBe("src/context/index.ts");
  });

  test("preFlightSnapshotSchema applies defaults", () => {
    const result = preFlightSnapshotSchema.parse({
      created_at: new Date().toISOString(),
    });
    expect(result.file_tree).toEqual([]);
    expect(result.test_files).toEqual([]);
    expect(result.git_history).toEqual([]);
    expect(result.import_graph).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fileTreeSnapshot
// ---------------------------------------------------------------------------

describe("fileTreeSnapshot", () => {
  test("returns non-empty array for this git repo", async () => {
    const entries = await fileTreeSnapshot(2, PROJECT_ROOT);
    expect(entries.length).toBeGreaterThan(0);
  });

  test("entries include both tree and blob types", async () => {
    const entries = await fileTreeSnapshot(2, PROJECT_ROOT);
    const types = new Set(entries.map((e) => e.type));
    expect(types.has("tree")).toBe(true);
    expect(types.has("blob")).toBe(true);
  });

  test("depth 1 returns only top-level entries", async () => {
    const entries = await fileTreeSnapshot(1, PROJECT_ROOT);
    // No paths should have more than 1 slash for blobs
    const deepBlobs = entries.filter(
      (e) => e.type === "blob" && e.path.split("/").length > 2,
    );
    expect(deepBlobs.length).toBe(0);
  });

  test("includes known directory like src", async () => {
    const entries = await fileTreeSnapshot(1, PROJECT_ROOT);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("src");
  });

  test("returns empty array for invalid cwd", async () => {
    const entries = await fileTreeSnapshot(2, "/nonexistent/path");
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discoverTestFiles
// ---------------------------------------------------------------------------

describe("discoverTestFiles", () => {
  test("returns non-empty array for this repo", async () => {
    const files = await discoverTestFiles(PROJECT_ROOT);
    expect(files.length).toBeGreaterThan(0);
  });

  test("all returned files match test patterns", async () => {
    const files = await discoverTestFiles(PROJECT_ROOT);
    for (const file of files) {
      const matchesPattern =
        file.includes(".test.") ||
        file.includes(".spec.") ||
        file.startsWith("__tests__/");
      expect(matchesPattern).toBe(true);
    }
  });

  test("results are sorted", async () => {
    const files = await discoverTestFiles(PROJECT_ROOT);
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  test("results are deduplicated", async () => {
    const files = await discoverTestFiles(PROJECT_ROOT);
    const unique = [...new Set(files)];
    expect(files.length).toBe(unique.length);
  });

  test("returns empty array for invalid cwd", async () => {
    const files = await discoverTestFiles("/nonexistent/path");
    expect(files).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// recentGitHistory
// ---------------------------------------------------------------------------

describe("recentGitHistory", () => {
  test("returns expected number of commits", async () => {
    const history = await recentGitHistory(5, PROJECT_ROOT);
    expect(history.length).toBe(5);
  });

  test("each commit has required fields", async () => {
    const history = await recentGitHistory(3, PROJECT_ROOT);
    for (const commit of history) {
      expect(commit.hash).toBeTruthy();
      expect(commit.subject).toBeTruthy();
      expect(commit.author).toBeTruthy();
      expect(commit.date).toBeTruthy();
    }
  });

  test("hash is a short hash (7+ chars)", async () => {
    const history = await recentGitHistory(1, PROJECT_ROOT);
    expect(history[0].hash.length).toBeGreaterThanOrEqual(7);
  });

  test("returns empty array for invalid cwd", async () => {
    const history = await recentGitHistory(5, "/nonexistent/path");
    expect(history).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// extractImportGraph
// ---------------------------------------------------------------------------

describe("extractImportGraph", () => {
  test("returns non-empty array for this repo", async () => {
    const graph = await extractImportGraph(PROJECT_ROOT);
    expect(graph.length).toBeGreaterThan(0);
  });

  test("edges have source and target fields", async () => {
    const graph = await extractImportGraph(PROJECT_ROOT);
    for (const edge of graph.slice(0, 10)) {
      expect(edge.source).toBeTruthy();
      expect(edge.target).toBeTruthy();
    }
  });

  test("all sources are under src/", async () => {
    const graph = await extractImportGraph(PROJECT_ROOT);
    for (const edge of graph) {
      expect(edge.source.startsWith("src/")).toBe(true);
    }
  });

  test("resolves ~/ alias to src/", async () => {
    const graph = await extractImportGraph(PROJECT_ROOT);
    const resolvedTargets = graph.filter((e) => e.target.startsWith("src/"));
    // At least some imports use ~/ alias which should be resolved to src/
    expect(resolvedTargets.length).toBeGreaterThan(0);
  });

  test("no external imports included", async () => {
    const graph = await extractImportGraph(PROJECT_ROOT);
    for (const edge of graph) {
      const isInternal =
        edge.target.startsWith("src/") ||
        edge.target.startsWith("./") ||
        edge.target.startsWith("../");
      expect(isInternal).toBe(true);
    }
  });

  test("returns empty array for invalid cwd", async () => {
    const graph = await extractImportGraph("/nonexistent/path");
    expect(graph).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// complexityToHydrationConfig
// ---------------------------------------------------------------------------

describe("complexityToHydrationConfig", () => {
  test("TRIVIAL: depth 2, no tests, 5 commits, no imports", () => {
    const config = complexityToHydrationConfig("TRIVIAL");
    expect(config.file_tree_depth).toBe(2);
    expect(config.include_tests).toBe(false);
    expect(config.git_history_count).toBe(5);
    expect(config.include_imports).toBe(false);
  });

  test("SIMPLE: depth 2, tests, 5 commits, no imports", () => {
    const config = complexityToHydrationConfig("SIMPLE");
    expect(config.file_tree_depth).toBe(2);
    expect(config.include_tests).toBe(true);
    expect(config.git_history_count).toBe(5);
    expect(config.include_imports).toBe(false);
  });

  test("MODERATE: depth 3, tests, 10 commits, imports", () => {
    const config = complexityToHydrationConfig("MODERATE");
    expect(config.file_tree_depth).toBe(3);
    expect(config.include_tests).toBe(true);
    expect(config.git_history_count).toBe(10);
    expect(config.include_imports).toBe(true);
  });

  test("COMPLEX: depth 4, tests, 15 commits, imports", () => {
    const config = complexityToHydrationConfig("COMPLEX");
    expect(config.file_tree_depth).toBe(4);
    expect(config.include_tests).toBe(true);
    expect(config.git_history_count).toBe(15);
    expect(config.include_imports).toBe(true);
  });

  test("CRITICAL: same as COMPLEX", () => {
    const config = complexityToHydrationConfig("CRITICAL");
    expect(config.file_tree_depth).toBe(4);
    expect(config.include_tests).toBe(true);
    expect(config.git_history_count).toBe(15);
    expect(config.include_imports).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generatePreFlightSnapshot
// ---------------------------------------------------------------------------

describe("generatePreFlightSnapshot", () => {
  test("generates valid snapshot with TRIVIAL config", async () => {
    const config = complexityToHydrationConfig("TRIVIAL");
    const snapshot = await generatePreFlightSnapshot(config, PROJECT_ROOT);

    // Validate against schema
    const result = preFlightSnapshotSchema.safeParse(snapshot);
    expect(result.success).toBe(true);

    // TRIVIAL: has file tree and git history, no tests/imports
    expect(snapshot.file_tree.length).toBeGreaterThan(0);
    expect(snapshot.git_history.length).toBeGreaterThan(0);
    expect(snapshot.test_files).toEqual([]);
    expect(snapshot.import_graph).toEqual([]);
    expect(snapshot.created_at).toBeTruthy();
  });

  test("generates valid snapshot with MODERATE config", async () => {
    const config = complexityToHydrationConfig("MODERATE");
    const snapshot = await generatePreFlightSnapshot(config, PROJECT_ROOT);

    // MODERATE: all fields populated
    expect(snapshot.file_tree.length).toBeGreaterThan(0);
    expect(snapshot.test_files.length).toBeGreaterThan(0);
    expect(snapshot.git_history.length).toBeGreaterThan(0);
    expect(snapshot.import_graph.length).toBeGreaterThan(0);
  });

  test("snapshot has ISO 8601 created_at timestamp", async () => {
    const config = complexityToHydrationConfig("TRIVIAL");
    const snapshot = await generatePreFlightSnapshot(config, PROJECT_ROOT);

    // Should parse as valid date
    const date = new Date(snapshot.created_at);
    expect(date.toString()).not.toBe("Invalid Date");
  });
});
