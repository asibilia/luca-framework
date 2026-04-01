import { z } from "zod";

/**
 * A single finding from the shadow scanner agent.
 *
 * Represents one piece of AI-session debris detected in the repository.
 * Categories cover orphaned temp scripts, misplaced files, tool artifacts,
 * dead exports, stale planning artifacts, and orphaned/misplaced markdown.
 *
 * Uses snake_case for data schema compatibility.
 */
export const ShadowFindingSchema = z.object({
  /** Detection category */
  category: z.enum([
    "orphaned-temp-script",
    "misplaced-file",
    "tool-artifact",
    "dead-export",
    "stale-planning-artifact",
    "orphaned-markdown",
  ]),
  /** Severity level of the finding */
  severity: z.enum(["critical", "high", "medium", "low"]),
  /** Repository-relative file path where the issue was found */
  file_path: z.string(),
  /** Human-readable description of the issue */
  description: z.string(),
  /** Recommended remediation action (human-readable context) */
  recommendation: z.string(),
  /** Machine-readable remediation verb */
  recommended_action: z.enum(["move", "delete", "gitignore"]).default("delete"),
  /** Destination path when recommended_action is "move" */
  target_path: z.string().optional(),
  /** Whether Luca can automatically apply the fix */
  auto_fixable: z.boolean().default(false),
});

export type ShadowFinding = z.infer<typeof ShadowFindingSchema>;

/**
 * Full output of a shadow scan run.
 *
 * Returned by the lu-shadow-scanner agent after scanning the repository.
 * Callers should parse the structured JSON block at the end of the agent
 * response against this schema.
 *
 * Uses snake_case for data schema compatibility.
 */
export const ShadowScanReportSchema = z.object({
  /** Scan depth used for this run */
  scan_mode: z.enum(["quick", "standard", "full"]),
  /** Category numbers that were actually scanned (1-6) */
  categories_scanned: z.array(z.number().int().min(1).max(6)).default([]),
  /** All findings from the scan */
  findings: z.array(ShadowFindingSchema).default([]),
  /** Severity breakdown totals */
  summary: z.object({
    total: z.number().int().default(0),
    critical: z.number().int().default(0),
    high: z.number().int().default(0),
    medium: z.number().int().default(0),
    low: z.number().int().default(0),
  }),
  /** ISO 8601 timestamp when the scan was completed */
  scanned_at: z.string().default(() => new Date().toISOString()),
});

export type ShadowScanReport = z.infer<typeof ShadowScanReportSchema>;

/**
 * Configuration shape for the shadow_debt section in .planning/config.json.
 *
 * Controls which scan mode runs at each workflow integration point,
 * what directories and patterns are allowlisted, and whether critical
 * findings block milestone completion.
 *
 * Uses snake_case for data schema compatibility.
 */
export const ShadowDebtConfigSchema = z.object({
  /** Whether shadow debt scanning is active */
  enabled: z.boolean().default(true),
  /** Scan mode used during phase-execute advisory scan (Step 10.6) */
  phase_scan_mode: z.enum(["quick", "standard", "full"]).default("quick"),
  /** Scan mode used during milestone-complete pre-archive gate (Step 0.7) */
  milestone_scan_mode: z.enum(["quick", "standard", "full"]).default("full"),
  /** When true, CRITICAL findings block milestone archival unless user skips */
  block_milestone_on_critical: z.boolean().default(true),
  /** Directories that are safe to contain generated or temporary content */
  allowlist: z
    .array(z.string())
    .default(["scripts/", ".planning/", "docs/", "packages/"]),
  /** Glob patterns that flag files as potential orphaned temp scripts */
  denylist_patterns: z
    .array(z.string())
    .default([
      "test-*.ts",
      "debug-*.ts",
      "check-*.ts",
      "fix-*.ts",
      "temp-*",
      "tmp-*",
      "scratch-*",
    ]),
  /** Directories where script-like files are expected and should not be flagged */
  known_good_script_dirs: z
    .array(z.string())
    .default(["scripts/", "src/hooks/scripts/", ".claude/hooks/"]),
  /** Directories that are known build artifact locations */
  known_artifact_dirs: z
    .array(z.string())
    .default([".playwright-cli", ".next", ".turbo", ".cache", "coverage"]),
  /** Canonical files allowed at .planning/ root level */
  planning_root_allowlist: z
    .array(z.string())
    .default([
      "config.json",
      "state.json",
      "session-ledger.jsonl",
      "ROADMAP.md",
      "PROJECT.md",
      "CANONICAL-DECISIONS.md",
      "MILESTONE-AUDIT.md",
      ".context-metrics.json",
      "harness-result.json",
    ]),
  /** Canonical directories allowed at .planning/ root level */
  planning_root_dirs: z
    .array(z.string())
    .default([
      "phases/",
      "milestones/",
      "todos/",
      "summaries/",
      "research/",
      "notes/",
      "codebase/",
      "checkpoints/",
      "harness-runs/",
      "migration/",
      "done/",
      "plans/",
    ]),
  /** Glob patterns for versioned files allowed at .planning/ root (e.g., milestone audits) */
  planning_root_versioned_patterns: z
    .array(z.string())
    .default(["v*-MILESTONE-AUDIT*.md"]),
});

export type ShadowDebtConfig = z.infer<typeof ShadowDebtConfigSchema>;
