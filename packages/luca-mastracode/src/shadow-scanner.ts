/**
 * Shadow scanner schemas and helpers.
 *
 * Data module backing the repo-cleanup tool and shadow-scanner subagent.
 * Defines finding/report/config schemas, config loading, and scan-mode
 * resolution.
 */
import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

/** A single finding from the shadow scanner. */
export const ShadowFindingSchema = z.object({
  category: z.enum([
    "orphaned-temp-script",
    "misplaced-file",
    "tool-artifact",
    "dead-export",
    "stale-planning-artifact",
    "orphaned-markdown",
    "repo-root-markdown",
  ]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  file_path: z.string(),
  description: z.string(),
  recommendation: z.string(),
  recommended_action: z.enum(["move", "delete", "gitignore"]).default("delete"),
  target_path: z.string().optional(),
  auto_fixable: z.boolean().default(false),
});

export type ShadowFinding = z.infer<typeof ShadowFindingSchema>;

/** Full output of a shadow scan run. */
export const ShadowScanReportSchema = z.object({
  scan_mode: z.enum(["quick", "standard", "full"]),
  categories_scanned: z.array(z.number().int().min(1).max(7)).default([]),
  findings: z.array(ShadowFindingSchema).default([]),
  summary: z.object({
    total: z.number().int().default(0),
    critical: z.number().int().default(0),
    high: z.number().int().default(0),
    medium: z.number().int().default(0),
    low: z.number().int().default(0),
  }),
  scanned_at: z.string().default(() => new Date().toISOString()),
});

export type ShadowScanReport = z.infer<typeof ShadowScanReportSchema>;

/** Configuration for the shadow_debt section in .planning/config.json. */
export const ShadowDebtConfigSchema = z.object({
  enabled: z.boolean().default(true),
  phase_scan_mode: z.enum(["quick", "standard", "full"]).default("quick"),
  milestone_scan_mode: z.enum(["quick", "standard", "full"]).default("full"),
  block_milestone_on_critical: z.boolean().default(true),
  allowlist: z
    .array(z.string())
    .default(["scripts/", ".planning/", "docs/", "packages/"]),
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
  known_good_script_dirs: z
    .array(z.string())
    .default(["scripts/", "src/hooks/scripts/", ".claude/hooks/"]),
  known_artifact_dirs: z
    .array(z.string())
    .default([".playwright-cli", ".next", ".turbo", ".cache", "coverage"]),
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
  planning_root_versioned_patterns: z
    .array(z.string())
    .default(["v*-MILESTONE-AUDIT*.md"]),
  /** Canonical .md files allowed at the repository root (Category 7 allowlist) */
  repo_root_markdown_allowlist: z
    .array(z.string())
    .default([
      "README.md",
      "CLAUDE.md",
      "AGENTS.md",
      "SECURITY.md",
      "LICENSE.md",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "CODE_OF_CONDUCT.md",
    ]),
});

export type ShadowDebtConfig = z.infer<typeof ShadowDebtConfigSchema>;

// ---------------------------------------------------------------------------
// Scan mode enum
// ---------------------------------------------------------------------------

export const ScanMode = z.enum(["quick", "standard", "full"]);
export type ScanMode = z.infer<typeof ScanMode>;

/** Category numbers included in each scan mode. */
export const SCAN_MODE_CATEGORIES: Record<ScanMode, readonly number[]> = {
  quick: [1, 3],
  standard: [1, 2, 3, 5, 6, 7],
  full: [1, 2, 3, 4, 5, 6, 7],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load the shadow_debt config from `.planning/config.json`.
 * Returns schema defaults if the file or section is missing.
 */
export function loadShadowDebtConfig(): ShadowDebtConfig {
  const configPath = join(process.cwd(), ".planning", "config.json");
  if (!existsSync(configPath)) {
    return ShadowDebtConfigSchema.parse({});
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return ShadowDebtConfigSchema.parse(raw.shadow_debt ?? {});
  } catch {
    return ShadowDebtConfigSchema.parse({});
  }
}

/**
 * Resolve scan mode from explicit flags or complexity level.
 *
 * Priority: explicit flag > complexity mapping > "standard" fallback.
 */
export function determineScanMode({
  flags,
  complexity,
}: {
  flags?: { quick?: boolean; full?: boolean };
  complexity?: string;
}): ScanMode {
  // Explicit flags take priority
  if (flags?.full) return "full";
  if (flags?.quick) return "quick";

  // Complexity-based mapping
  if (complexity) {
    const upper = complexity.toUpperCase();
    if (upper === "TRIVIAL" || upper === "SIMPLE") return "quick";
    if (upper === "MODERATE") return "standard";
    if (upper === "COMPLEX" || upper === "CRITICAL") return "full";
  }

  return "standard";
}
