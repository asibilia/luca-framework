/**
 * Deterministic INDEX.md generation from scout state files.
 *
 * Reads all `.scout-state/*.json` files, validates them against
 * `ScoutStateFileSchema`, groups articles by status category,
 * and writes a structured markdown INDEX.md to the scout directory.
 *
 * Pure deterministic function -- no LLM judgment involved. Designed to
 * be called from the scout pipeline after any state transition to keep
 * the human-readable index in sync with the machine-readable state files.
 *
 * Uses snake_case for the IndexStats schema (data returned to callers).
 *
 * @module skills/scout-index
 *
 * @example
 * ```typescript
 * import { updateScoutIndex } from "~/skills/__helpers/scout-index";
 *
 * const stats = await updateScoutIndex(".planning/scouting");
 * // {
 * //   total: 5,
 * //   integrated: 2,
 * //   deferred: 1,
 * //   manual_review: 1,
 * //   in_progress: 1,
 * // }
 * ```
 *
 * @example
 * ```typescript
 * // Empty state directory produces empty template
 * const stats = await updateScoutIndex(".planning/scouting");
 * // { total: 0, integrated: 0, deferred: 0, manual_review: 0, in_progress: 0 }
 * ```
 */
import { z } from "zod";
import orderBy from "lodash/orderBy";
import groupBy from "lodash/groupBy";

import { ScoutStateFileSchema } from "~/shared/__schemas/scout-state.schemas";

import type { ScoutStateFile } from "~/shared/__schemas/scout-state.schemas";

// ─── Schemas ──────────────────────────────────────────────────────────────────

/**
 * Summary statistics for the generated scout index.
 *
 * Uses snake_case for data schema compatibility (returned from async function).
 */
export const IndexStatsSchema = z.object({
  /** Total number of articles across all categories. */
  total: z.number().int().nonnegative(),
  /** Count of articles in COMPLETE state. */
  integrated: z.number().int().nonnegative(),
  /** Count of articles in DEFERRED state. */
  deferred: z.number().int().nonnegative(),
  /** Count of articles in LOW_RELEVANCE or CONFLICTING state. */
  manual_review: z.number().int().nonnegative(),
  /** Count of articles still progressing through the pipeline. */
  in_progress: z.number().int().nonnegative(),
});

/** Inferred TypeScript type for scout index summary statistics. */
export type IndexStats = z.infer<typeof IndexStatsSchema>;

// ─── Category Classification ──────────────────────────────────────────────────

/**
 * Status categories for grouping articles in the index.
 *
 * - integrated: COMPLETE (fully processed, terminal)
 * - deferred: DEFERRED (valid work, intentionally postponed)
 * - manual_review: LOW_RELEVANCE or CONFLICTING (needs human decision)
 * - in_progress: everything else (still moving through the pipeline)
 */
type StatusCategory =
  | "integrated"
  | "deferred"
  | "manual_review"
  | "in_progress";

/** Manual review terminal states that require human attention. */
const MANUAL_REVIEW_STATES = ["LOW_RELEVANCE", "CONFLICTING"] as const;

/**
 * Classify a scout state file into a status category.
 *
 * @param state - The current_state field from a ScoutStateFile
 * @returns The category this article belongs to
 */
const classifyArticle = (state: string): StatusCategory => {
  if (state === "COMPLETE") return "integrated";
  if (state === "DEFERRED") return "deferred";
  if (
    MANUAL_REVIEW_STATES.includes(
      state as (typeof MANUAL_REVIEW_STATES)[number],
    )
  ) {
    return "manual_review";
  }
  return "in_progress";
};

// ─── Markdown Rendering ───────────────────────────────────────────────────────

/**
 * Format an ISO date string to YYYY-MM-DD for table display.
 *
 * @param isoDate - ISO 8601 date string
 * @returns YYYY-MM-DD formatted date, or the original string if unparseable
 */
const formatDate = (isoDate: string): string => {
  const match = isoDate.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? isoDate;
};

/**
 * Build a markdown link, returning plain text if the path is absent.
 *
 * @param label - Link display text
 * @param path - Optional relative file path
 * @returns Markdown link or dash placeholder
 */
const mdLink = (label: string, path: string | undefined): string =>
  path ? `[${label}](${path})` : "-";

/**
 * Render the Integrated section table rows.
 *
 * | Date | Article | Digest | Impact |
 */
const renderIntegratedRows = (articles: ScoutStateFile[]): string => {
  const header = `| Date | Article | Digest | Impact |
|------|---------|--------|--------|`;

  if (articles.length === 0)
    return `${header}\n| - | _No integrated articles yet_ | - | - |`;

  const rows = articles
    .map((a) => {
      const date = formatDate(a.updated_at);
      const title = a.title || a.slug;
      const articleLink = `[${title}](${a.url})`;
      const digest = mdLink("digest", a.artifacts.digest_path);
      const impact = mdLink("impact", a.artifacts.impact_path);
      return `| ${date} | ${articleLink} | ${digest} | ${impact} |`;
    })
    .join("\n");

  return `${header}\n${rows}`;
};

/**
 * Render the In Progress section table rows.
 *
 * | Date | Article | Status | Digest |
 */
const renderInProgressRows = (articles: ScoutStateFile[]): string => {
  const header = `| Date | Article | Status | Digest |
|------|---------|--------|--------|`;

  if (articles.length === 0)
    return `${header}\n| - | _No articles in progress_ | - | - |`;

  const rows = articles
    .map((a) => {
      const date = formatDate(a.updated_at);
      const title = a.title || a.slug;
      const articleLink = `[${title}](${a.url})`;
      const status = a.current_state;
      const digest = mdLink("digest", a.artifacts.digest_path);
      return `| ${date} | ${articleLink} | ${status} | ${digest} |`;
    })
    .join("\n");

  return `${header}\n${rows}`;
};

/**
 * Render the Deferred section table rows.
 *
 * | Date | Article | Digest | Reason |
 */
const renderDeferredRows = (articles: ScoutStateFile[]): string => {
  const header = `| Date | Article | Digest | Reason |
|------|---------|--------|--------|`;

  if (articles.length === 0)
    return `${header}\n| - | _No deferred articles_ | - | - |`;

  const rows = articles
    .map((a) => {
      const date = formatDate(a.updated_at);
      const title = a.title || a.slug;
      const articleLink = `[${title}](${a.url})`;
      const digest = mdLink("digest", a.artifacts.digest_path);
      const reason = mdLink("rationale", a.artifacts.deferred_path);
      return `| ${date} | ${articleLink} | ${digest} | ${reason} |`;
    })
    .join("\n");

  return `${header}\n${rows}`;
};

/**
 * Render the Manual Review section table rows.
 *
 * | Date | Article | Reason | Digest |
 */
const renderManualReviewRows = (articles: ScoutStateFile[]): string => {
  const header = `| Date | Article | Reason | Digest |
|------|---------|--------|--------|`;

  if (articles.length === 0)
    return `${header}\n| - | _No articles for manual review_ | - | - |`;

  const rows = articles
    .map((a) => {
      const date = formatDate(a.updated_at);
      const title = a.title || a.slug;
      const articleLink = `[${title}](${a.url})`;
      const reason =
        a.current_state === "CONFLICTING"
          ? mdLink("conflicts", a.artifacts.manual_review_path)
          : "Low relevance";
      const digest = mdLink("digest", a.artifacts.digest_path);
      return `| ${date} | ${articleLink} | ${reason} | ${digest} |`;
    })
    .join("\n");

  return `${header}\n${rows}`;
};

/**
 * Assemble the full INDEX.md content from grouped articles.
 *
 * @param groups - Articles grouped by status category
 * @param stats - Summary statistics
 * @returns Complete markdown string for INDEX.md
 */
const renderIndexMarkdown = (
  groups: Record<StatusCategory, ScoutStateFile[]>,
  stats: IndexStats,
): string => {
  const lines: string[] = [
    "# Scouting Index",
    "",
    "_Auto-maintained by scout pipeline. Do not edit manually._",
    "",
    `**Summary:** ${stats.total} articles scouted (${stats.integrated} integrated, ${stats.deferred} deferred, ${stats.manual_review} manual review, ${stats.in_progress} in progress)`,
    "",
    "## Integrated",
    "",
    renderIntegratedRows(groups.integrated),
    "",
    "## In Progress",
    "",
    renderInProgressRows(groups.in_progress),
    "",
    "## Deferred",
    "",
    renderDeferredRows(groups.deferred),
    "",
    "## Manual Review",
    "",
    renderManualReviewRows(groups.manual_review),
    "",
  ];

  return lines.join("\n");
};

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Regenerate .planning/scouting/INDEX.md from .scout-state/ files.
 *
 * Pure deterministic function -- reads state files, generates markdown table,
 * writes INDEX.md. No LLM judgment involved.
 *
 * Scans `${scoutDir}/.scout-state/*.json`, validates each file against
 * `ScoutStateFileSchema`, groups articles into four status categories
 * (integrated, in progress, deferred, manual review), sorts each group
 * by `updated_at` descending, and writes a structured markdown index.
 *
 * Files that fail schema validation are silently skipped with a console
 * warning. If no valid state files exist, an empty template is written.
 *
 * @param scoutDir - Path to .planning/scouting/ directory (absolute or relative)
 * @returns Summary stats: total, integrated, deferred, manual_review, in_progress
 *
 * @example
 * ```typescript
 * import { updateScoutIndex } from "~/skills/__helpers/scout-index";
 *
 * // After a scout pipeline run completes
 * const stats = await updateScoutIndex(".planning/scouting");
 * console.log(`Indexed ${stats.total} articles`);
 * // Indexed 5 articles
 * ```
 *
 * @example
 * ```typescript
 * // Handles empty state gracefully
 * const stats = await updateScoutIndex(".planning/scouting");
 * // { total: 0, integrated: 0, deferred: 0, manual_review: 0, in_progress: 0 }
 * // INDEX.md is written with empty tables
 * ```
 */
export const updateScoutIndex = async (
  scoutDir: string,
): Promise<IndexStats> => {
  const stateDir = `${scoutDir}/.scout-state`;
  const indexPath = `${scoutDir}/INDEX.md`;

  // ── Scan state files ──────────────────────────────────────────────────────

  const articles: ScoutStateFile[] = [];
  const glob = new Bun.Glob("*.json");

  for await (const filename of glob.scan({ cwd: stateDir, absolute: false })) {
    const filePath = `${stateDir}/${filename}`;

    try {
      const raw = await Bun.file(filePath).json();
      const parseResult = ScoutStateFileSchema.safeParse(raw);

      if (!parseResult.success) {
        console.warn(
          `[scout-index] Skipping invalid state file: ${filename}`,
          parseResult.error.issues,
        );
        continue;
      }

      articles.push(parseResult.data);
    } catch (error) {
      console.warn(
        `[scout-index] Failed to read state file: ${filename}`,
        error,
      );
    }
  }

  // ── Classify and group ────────────────────────────────────────────────────

  const grouped = groupBy(articles, (a) => classifyArticle(a.current_state));

  const groups: Record<StatusCategory, ScoutStateFile[]> = {
    integrated: orderBy(grouped["integrated"] ?? [], ["updated_at"], ["desc"]),
    in_progress: orderBy(
      grouped["in_progress"] ?? [],
      ["updated_at"],
      ["desc"],
    ),
    deferred: orderBy(grouped["deferred"] ?? [], ["updated_at"], ["desc"]),
    manual_review: orderBy(
      grouped["manual_review"] ?? [],
      ["updated_at"],
      ["desc"],
    ),
  };

  // ── Compute stats ─────────────────────────────────────────────────────────

  const stats: IndexStats = {
    total: articles.length,
    integrated: groups.integrated.length,
    deferred: groups.deferred.length,
    manual_review: groups.manual_review.length,
    in_progress: groups.in_progress.length,
  };

  // ── Render and write ──────────────────────────────────────────────────────

  const markdown = renderIndexMarkdown(groups, stats);
  await Bun.write(indexPath, markdown);

  return stats;
};
