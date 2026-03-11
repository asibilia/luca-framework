/**
 * Cross-agent interop scanner.
 *
 * Discovers agent definition files across known IDE tool directories
 * (.claude/, .cursor/, .gemini/, .codex/, .github/copilot/), reads
 * their content, and normalizes them into InteropAgentSummary records.
 *
 * Uses Bun file APIs exclusively (no node:fs). All file operations
 * are gracefully fallible -- missing directories or unreadable files
 * are silently skipped.
 *
 * This module is T1 (Core) and imports only from its own domain schemas
 * and helpers. No T2 (agents/skills/rules) imports.
 *
 * @module
 */
import { resolve } from "node:path";

import { join } from "pathe";

import type {
  InteropAgentSummary,
  InteropScanConfig,
  InteropScanResult,
  SourceTool,
} from "../__schemas/interop.schemas";
import {
  interopScanConfigSchema,
  interopScanResultSchema,
} from "../__schemas/interop.schemas";
import { normalizeAgent } from "./normalizer";

// ---------------------------------------------------------------------------
// Known agent directories
// ---------------------------------------------------------------------------

/**
 * Default IDE agent directory patterns relative to the project root.
 *
 * These are the conventional locations where various AI coding tools
 * store their agent definitions. The scanner checks each of these
 * for existence and scans any that are present.
 */
export const KNOWN_AGENT_DIRS: readonly string[] = [
  ".claude/agents",
  ".cursor/agents",
  ".gemini",
  ".codex",
  ".github/copilot",
];

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

/**
 * Check whether a directory exists using Bun file APIs.
 *
 * @param dirPath - Absolute path to check
 * @returns true if the path exists and is accessible
 */
async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    // Bun.file().exists() is not reliable for directories.
    // Use Bun.spawn with test -d for reliable directory checks.
    const proc = Bun.spawn(["test", "-d", dirPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Discover agent definition files in a directory matching include patterns.
 *
 * Uses Bun.Glob to find files matching the configured include patterns.
 * Returns project-relative paths.
 *
 * @param dirPath - Absolute path to the directory to scan
 * @param projectRoot - Absolute path to the project root
 * @param includePatterns - Glob patterns to match (e.g., ["*.md", "*.ts"])
 * @returns Array of project-relative file paths
 */
async function discoverAgentFiles(
  dirPath: string,
  projectRoot: string,
  includePatterns: string[],
): Promise<string[]> {
  const files: string[] = [];

  for (const pattern of includePatterns) {
    try {
      const glob = new Bun.Glob(pattern);
      for await (const match of glob.scan({ cwd: dirPath, absolute: false })) {
        // Build project-relative path
        const absolutePath = join(dirPath, match);
        const relativePath = absolutePath.startsWith(projectRoot)
          ? absolutePath.slice(projectRoot.length + 1)
          : match;
        files.push(relativePath);
      }
    } catch {
      // Skip patterns that fail (e.g., permission errors)
    }
  }

  // Deduplicate in case a file matches multiple patterns
  return [...new Set(files)];
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

/**
 * Scan IDE tool directories for agent definitions and normalize them.
 *
 * Iterates over configured scan directories (or KNOWN_AGENT_DIRS by default),
 * checks each for existence, discovers matching files, reads their content,
 * and normalizes each into an InteropAgentSummary.
 *
 * The scanner is designed to be resilient: missing directories, unreadable
 * files, and parse failures are silently skipped. The scan result always
 * contains valid data even if some sources fail.
 *
 * @param projectRoot - Absolute path to the project root directory
 * @param config - Optional scan configuration (directories, patterns)
 * @returns Structured scan result with agent summaries and metadata
 *
 * @example
 * ```typescript
 * const result = await scanForAgents("/path/to/project")
 * // {
 * //   agents: [{ name: "lu-router", source_tool: "claude", ... }, ...],
 * //   scan_paths: ["/path/to/project/.claude/agents", ...],
 * //   scan_duration_ms: 42,
 * //   tool_counts: { claude: 15, cursor: 15 },
 * // }
 * ```
 *
 * @example
 * ```typescript
 * // Custom scan directories
 * const result = await scanForAgents("/path/to/project", {
 *   scan_dirs: [".claude/agents", ".custom/agents"],
 *   include_patterns: ["*.md"],
 *   exclude_patterns: [],
 * })
 * ```
 */
export async function scanForAgents(
  projectRoot: string,
  config?: Partial<InteropScanConfig>,
): Promise<InteropScanResult> {
  const startTime = performance.now();

  // Canonicalize and validate projectRoot to prevent path traversal
  const canonicalRoot = resolve(projectRoot);
  if (!canonicalRoot.startsWith("/")) {
    // Non-absolute path after resolve -- reject
    return interopScanResultSchema.parse({
      agents: [],
      scan_paths: [],
      scan_duration_ms: 0,
      tool_counts: {},
    });
  }

  // Parse config with schema defaults
  const parsedConfig = interopScanConfigSchema.safeParse(config ?? {});
  const resolvedConfig = parsedConfig.success
    ? parsedConfig.data
    : interopScanConfigSchema.parse({});

  const agents: InteropAgentSummary[] = [];
  const scanPaths: string[] = [];
  const toolCounts: Record<string, number> = {};

  for (const scanDir of resolvedConfig.scan_dirs) {
    const absoluteDir = join(canonicalRoot, scanDir);

    // Containment check: ensure resolved dir is within the canonical root
    const resolvedDir = resolve(absoluteDir);
    if (
      resolvedDir !== canonicalRoot &&
      !resolvedDir.startsWith(canonicalRoot + "/")
    )
      continue;

    // Check if directory exists
    const exists = await directoryExists(resolvedDir);
    if (!exists) continue;

    scanPaths.push(resolvedDir);

    // Discover agent files
    const files = await discoverAgentFiles(
      resolvedDir,
      canonicalRoot,
      resolvedConfig.include_patterns,
    );

    // Read and normalize each file
    for (const relativePath of files) {
      try {
        const absolutePath = join(canonicalRoot, relativePath);

        // Containment check: ensure resolved path is within the canonical root
        const resolvedPath = resolve(absolutePath);
        if (!resolvedPath.startsWith(canonicalRoot + "/")) continue;

        const bunFile = Bun.file(resolvedPath);

        if (!(await bunFile.exists())) continue;

        const content = await bunFile.text();
        if (!content.trim()) continue;

        const summary = normalizeAgent(relativePath, content);
        agents.push(summary);

        // Track tool counts
        const tool: SourceTool = summary.source_tool;
        toolCounts[tool] = (toolCounts[tool] ?? 0) + 1;
      } catch {
        // Skip unreadable files silently
      }
    }
  }

  const scanDurationMs = Math.round(performance.now() - startTime);

  const raw = {
    agents,
    scan_paths: scanPaths,
    scan_duration_ms: scanDurationMs,
    tool_counts: toolCounts,
  };

  const parseResult = interopScanResultSchema.safeParse(raw);
  if (!parseResult.success) {
    console.error(
      `[interop/scanner] Failed to parse scan result: ${parseResult.error.message}`,
    );
    // Return the raw data cast to the expected type
    return raw as InteropScanResult;
  }

  return parseResult.data;
}

// ---------------------------------------------------------------------------
// Summary formatter
// ---------------------------------------------------------------------------

/**
 * Format scan results into a human-readable string for context injection.
 *
 * Produces a markdown-formatted summary suitable for the context assembler's
 * `agent_summaries` field. Groups agents by source tool and lists their
 * names, descriptions, and capabilities.
 *
 * @param result - The scan result to format
 * @returns Formatted markdown string
 *
 * @example
 * ```typescript
 * const result = await scanForAgents("/path/to/project")
 * const summary = formatScanSummary(result)
 * // "# Discovered Agents\n\n## claude (15 agents)\n\n- **lu-router**: Routes tasks..."
 * ```
 */
export function formatScanSummary(result: InteropScanResult): string {
  if (result.agents.length === 0) {
    return "No agents discovered across IDE tool directories.";
  }

  const lines: string[] = [
    `# Discovered Agents (${result.agents.length} total)`,
    "",
  ];

  // Group by source tool
  const byTool = new Map<string, InteropAgentSummary[]>();
  for (const agent of result.agents) {
    const existing = byTool.get(agent.source_tool) ?? [];
    existing.push(agent);
    byTool.set(agent.source_tool, existing);
  }

  for (const [tool, toolAgents] of byTool) {
    lines.push(`## ${tool} (${toolAgents.length} agents)`);
    lines.push("");

    for (const agent of toolAgents) {
      const desc = agent.description ? `: ${agent.description}` : "";
      const caps =
        agent.capabilities.length > 0
          ? ` [${agent.capabilities.join(", ")}]`
          : "";
      lines.push(`- **${agent.name}**${desc}${caps}`);
    }

    lines.push("");
  }

  lines.push(
    `_Scanned ${result.scan_paths.length} directories in ${result.scan_duration_ms}ms_`,
  );

  return lines.join("\n");
}
