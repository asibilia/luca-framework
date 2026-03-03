/**
 * Pre-flight context hydration: deterministic codebase snapshot collection.
 *
 * Collects file tree, test files, git history, and import graph data
 * before major operations. All functions use git commands for consistency
 * with the repository state and to respect .gitignore rules.
 *
 * @module
 */
import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import type {
  FileTreeEntry,
  GitCommitSummary,
  HydrationConfig,
  ImportEdge,
  PreFlightSnapshot,
} from "~/context/__schemas/context.schemas";
import {
  hydrationConfigSchema,
  preFlightSnapshotSchema,
} from "~/context/__schemas/context.schemas";
import type { ComplexityLevel } from "~/complexity/__schemas/complexity.schemas";

// ---------------------------------------------------------------------------
// File tree snapshot
// ---------------------------------------------------------------------------

/**
 * Collect a file tree snapshot from the git index.
 *
 * Uses `git ls-tree` to list tracked files at a given depth, respecting
 * .gitignore. Returns an array of FileTreeEntry objects.
 *
 * @param depth - Maximum directory depth to traverse (default: 3)
 * @param cwd - Working directory (default: process.cwd())
 * @returns Array of file tree entries
 *
 * @example
 * ```typescript
 * const tree = await fileTreeSnapshot(2)
 * // [{ path: "src", type: "tree" }, { path: "src/context", type: "tree" }, ...]
 * ```
 */
export async function fileTreeSnapshot(
  depth: number = 3,
  cwd: string = process.cwd(),
): Promise<FileTreeEntry[]> {
  try {
    const proc = Bun.spawn(["git", "ls-tree", "-r", "--name-only", "HEAD"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    if (!stdout.trim()) return [];

    const files = stdout.trim().split("\n");
    const entries: FileTreeEntry[] = [];
    const seenDirs = new Set<string>();

    for (const filePath of files) {
      const parts = filePath.split("/");

      // Add directory entries up to max depth
      for (let i = 0; i < Math.min(parts.length - 1, depth); i++) {
        const dirPath = parts.slice(0, i + 1).join("/");
        if (!seenDirs.has(dirPath)) {
          seenDirs.add(dirPath);
          entries.push({ path: dirPath, type: "tree" });
        }
      }

      // Add file entry only if within depth
      if (parts.length <= depth + 1) {
        entries.push({ path: filePath, type: "blob" });
      }
    }

    return entries;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Test file discovery
// ---------------------------------------------------------------------------

/**
 * Discover test files tracked by git.
 *
 * Uses `git ls-files` with glob patterns to find test files matching
 * common naming conventions (*.test.ts, *.spec.ts, __tests__/).
 *
 * @param cwd - Working directory (default: process.cwd())
 * @returns Array of test file paths relative to project root
 *
 * @example
 * ```typescript
 * const tests = await discoverTestFiles()
 * // ["__tests__/src/rules/rule-registry.test.ts", "src/foo.test.ts"]
 * ```
 */
export async function discoverTestFiles(
  cwd: string = process.cwd(),
): Promise<string[]> {
  try {
    const proc = Bun.spawn(
      [
        "git",
        "ls-files",
        "--",
        "*.test.ts",
        "*.spec.ts",
        "*.test.tsx",
        "*.spec.tsx",
        "__tests__/**",
      ],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    if (!stdout.trim()) return [];

    // Deduplicate (a file in __tests__/ with .test.ts extension matches both patterns)
    return [...new Set(stdout.trim().split("\n"))].sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Git history extraction
// ---------------------------------------------------------------------------

/**
 * Extract recent git commit summaries.
 *
 * Uses `git log` with a structured format to extract hash, subject,
 * author, and date for recent commits.
 *
 * @param count - Number of commits to retrieve (default: 10)
 * @param cwd - Working directory (default: process.cwd())
 * @returns Array of git commit summaries, newest first
 *
 * @example
 * ```typescript
 * const history = await recentGitHistory(5)
 * // [{ hash: "abc1234", subject: "feat: add feature", author: "Dev", date: "2026-03-01T..." }]
 * ```
 */
export async function recentGitHistory(
  count: number = 10,
  cwd: string = process.cwd(),
): Promise<GitCommitSummary[]> {
  try {
    const separator = "|||";
    const format = `%h${separator}%s${separator}%an${separator}%aI`;

    const proc = Bun.spawn(["git", "log", `--format=${format}`, `-${count}`], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    if (!stdout.trim()) return [];

    return stdout
      .trim()
      .split("\n")
      .map((line) => {
        const [hash, subject, author, date] = line.split(separator);
        return {
          hash: hash ?? "",
          subject: subject ?? "",
          author: author ?? "",
          date: date ?? "",
        };
      })
      .filter((c) => c.hash.length > 0);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Import graph extraction
// ---------------------------------------------------------------------------

/**
 * Extract import dependency graph from TypeScript source files.
 *
 * Reads tracked .ts files and extracts import/export-from statements
 * using regex. Resolves `~/` aliases to `src/` paths.
 *
 * @param cwd - Working directory (default: process.cwd())
 * @returns Array of import edges (source -> target)
 *
 * @example
 * ```typescript
 * const graph = await extractImportGraph()
 * // [{ source: "src/context/index.ts", target: "src/context/__schemas/context.schemas" }]
 * ```
 */
export async function extractImportGraph(
  cwd: string = process.cwd(),
): Promise<ImportEdge[]> {
  try {
    // Get all tracked .ts files under src/
    const proc = Bun.spawn(["git", "ls-files", "--", "src/**/*.ts"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    await proc.exited;

    if (!stdout.trim()) return [];

    const files = stdout.trim().split("\n");
    const edges: ImportEdge[] = [];

    // Regex to match import/export-from statements
    const importRegex =
      /(?:import|export)\s+(?:type\s+)?(?:\{[^}]*\}|[^;{]*)\s+from\s+["']([^"']+)["']/g;

    for (const filePath of files) {
      const fullPath = join(cwd, filePath);
      if (!existsSync(fullPath)) continue;

      try {
        const content = readFileSync(fullPath, "utf-8");
        let match: RegExpExecArray | null;

        // Reset lastIndex for each file
        importRegex.lastIndex = 0;

        while ((match = importRegex.exec(content)) !== null) {
          const rawTarget = match[1];
          if (!rawTarget) continue;

          let target = rawTarget;

          // Resolve ~/ alias to src/
          if (target.startsWith("~/")) {
            target = `src/${target.slice(2)}`;
          }

          // Only include internal imports (relative or ~/alias)
          if (
            target.startsWith("src/") ||
            target.startsWith("./") ||
            target.startsWith("../")
          ) {
            edges.push({ source: filePath, target });
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return edges;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Complexity-to-config mapping
// ---------------------------------------------------------------------------

/**
 * Map a complexity level to hydration configuration parameters.
 *
 * Higher complexity levels receive deeper file trees, more git history,
 * and additional data sources (tests, imports).
 *
 * @param complexity - The task complexity level
 * @returns HydrationConfig with appropriate parameter values
 *
 * @example
 * ```typescript
 * const config = complexityToHydrationConfig("MODERATE")
 * // { file_tree_depth: 3, include_tests: true, git_history_count: 10, include_imports: true }
 * ```
 */
export function complexityToHydrationConfig(
  complexity: ComplexityLevel,
): HydrationConfig {
  switch (complexity) {
    case "TRIVIAL":
      return hydrationConfigSchema.parse({
        file_tree_depth: 2,
        include_tests: false,
        git_history_count: 5,
        include_imports: false,
      });
    case "SIMPLE":
      return hydrationConfigSchema.parse({
        file_tree_depth: 2,
        include_tests: true,
        git_history_count: 5,
        include_imports: false,
      });
    case "MODERATE":
      return hydrationConfigSchema.parse({
        file_tree_depth: 3,
        include_tests: true,
        git_history_count: 10,
        include_imports: true,
      });
    case "COMPLEX":
    case "CRITICAL":
      return hydrationConfigSchema.parse({
        file_tree_depth: 4,
        include_tests: true,
        git_history_count: 15,
        include_imports: true,
      });
  }
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Generate a complete pre-flight hydration snapshot.
 *
 * Orchestrates all snapshot functions based on the hydration config.
 * Collects file tree, test files (if enabled), git history, and
 * import graph (if enabled) in parallel where possible.
 *
 * @param config - Hydration configuration (use complexityToHydrationConfig to derive)
 * @param cwd - Working directory (default: process.cwd())
 * @returns Complete PreFlightSnapshot
 *
 * @example
 * ```typescript
 * const config = complexityToHydrationConfig("MODERATE")
 * const snapshot = await generatePreFlightSnapshot(config)
 * ```
 */
export async function generatePreFlightSnapshot(
  config: HydrationConfig,
  cwd: string = process.cwd(),
): Promise<PreFlightSnapshot> {
  // Run independent operations in parallel
  const [fileTree, testFiles, gitHistory, importGraph] = await Promise.all([
    fileTreeSnapshot(config.file_tree_depth, cwd),
    config.include_tests ? discoverTestFiles(cwd) : Promise.resolve([]),
    recentGitHistory(config.git_history_count, cwd),
    config.include_imports ? extractImportGraph(cwd) : Promise.resolve([]),
  ]);

  return preFlightSnapshotSchema.parse({
    file_tree: fileTree,
    test_files: testFiles,
    git_history: gitHistory,
    import_graph: importGraph,
    created_at: new Date().toISOString(),
  });
}
