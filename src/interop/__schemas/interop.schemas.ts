/**
 * Zod schemas for the cross-agent interop scanner.
 *
 * Defines types for discovering agent definitions across IDE tool
 * directories (.claude/, .gemini/, .codex/, .github/copilot/),
 * normalizing them to a common summary format, and returning structured
 * scan results.
 *
 * This module is T1 (Core) and imports only from T0 (shared, complexity)
 * or external packages. It does NOT import from agents, skills, or rules.
 *
 * Uses snake_case for API compatibility.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Source tool enum
// ---------------------------------------------------------------------------

/**
 * IDE/tool platforms whose agent directories are recognized by the scanner.
 *
 * - claude: .claude/agents/
 * - gemini: .gemini/
 * - codex: .codex/
 * - copilot: .github/copilot/
 * - other: Unrecognized directory or custom location
 */
export const SOURCE_TOOLS = [
  "claude",
  "gemini",
  "codex",
  "copilot",
  "other",
] as const;

export const sourceToolSchema = z.enum(SOURCE_TOOLS);

/** Source tool type derived from schema */
export type SourceTool = z.infer<typeof sourceToolSchema>;

// ---------------------------------------------------------------------------
// Interop agent summary
// ---------------------------------------------------------------------------

/**
 * Normalized summary of an agent discovered in an IDE tool directory.
 *
 * Captures the essential identity and capabilities of an agent regardless
 * of which tool defined it. Used to populate the context assembler's
 * `agent_summaries` field so that Luca agents are aware of peer agents
 * from other platforms.
 *
 * Uses snake_case for API compatibility.
 */
export const interopAgentSummarySchema = z.object({
  /** Agent name extracted from frontmatter or filename */
  name: z.string(),
  /** Which IDE tool defined this agent */
  source_tool: sourceToolSchema,
  /** Absolute or project-relative file path where the agent was found */
  file_path: z.string(),
  /** Capabilities extracted from section headings or frontmatter */
  capabilities: z.array(z.string()).default([]),
  /** Short description of the agent's purpose */
  description: z.string().default(""),
  /** Optional model preference declared in frontmatter */
  model_preference: z.string().optional(),
});

/** Interop agent summary type derived from schema */
export type InteropAgentSummary = z.infer<typeof interopAgentSummarySchema>;

// ---------------------------------------------------------------------------
// Scan result
// ---------------------------------------------------------------------------

/**
 * Complete result of scanning IDE tool directories for agent definitions.
 *
 * Contains all discovered agents, the paths that were scanned, timing
 * information, and a breakdown of how many agents were found per tool.
 *
 * Uses snake_case for API compatibility.
 */
export const interopScanResultSchema = z.object({
  /** All discovered agent summaries */
  agents: z.array(interopAgentSummarySchema).default([]),
  /** Directories that were scanned (absolute paths) */
  scan_paths: z.array(z.string()).default([]),
  /** Total scan duration in milliseconds */
  scan_duration_ms: z.number().nonnegative().default(0),
  /** Count of agents discovered per source tool */
  tool_counts: z.record(z.string(), z.number()).default({}),
});

/** Interop scan result type derived from schema */
export type InteropScanResult = z.infer<typeof interopScanResultSchema>;

// ---------------------------------------------------------------------------
// Scan configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for the interop scanner.
 *
 * Controls which directories are scanned and which file patterns
 * are included or excluded. Defaults cover all known IDE agent directories.
 *
 * Uses snake_case for API compatibility.
 */
export const interopScanConfigSchema = z.object({
  /** Directories to scan, relative to project root */
  scan_dirs: z
    .array(z.string())
    .default([".claude/agents", ".gemini", ".codex", ".github/copilot"]),
  /** File glob patterns to include when scanning */
  include_patterns: z.array(z.string()).default(["*.md", "*.ts"]),
  /** File glob patterns to exclude when scanning */
  exclude_patterns: z.array(z.string()).default([]),
});

/** Interop scan configuration type derived from schema */
export type InteropScanConfig = z.infer<typeof interopScanConfigSchema>;
