/**
 * Session digest helper for creating compact phase summaries.
 *
 * Called after lu-executor completes a wave to summarize key findings
 * into a single digest that can be passed by ID to downstream agents.
 * Deduplicates findings and truncates to keep digests compact.
 *
 * Source: src/shared/__helpers/session-digest.ts
 */

import { z } from "zod";
import uniq from "lodash/uniq";

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Configuration schema for createSessionDigest.
 */
export const SessionDigestConfigSchema = z.object({
  findings: z.array(z.string()).min(0),
  phaseId: z.union([z.string(), z.number()]),
  maxTokens: z.number().int().positive().default(300),
});

export type SessionDigestConfig = z.infer<typeof SessionDigestConfigSchema>;

/**
 * Result of creating a session digest.
 */
export interface SessionDigestResult {
  /** The formatted digest content string */
  content: string;
  /** Suggested engram ID for MuninnDB storage */
  engramId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Rough token estimate: ~4 characters per token (conservative).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Normalize a finding string for deduplication:
 * lowercase, collapse whitespace, trim.
 */
function normalize(finding: string): string {
  return finding.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Deduplicate findings by normalized content while preserving
 * the original casing of the first occurrence.
 */
function deduplicateFindings(findings: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const finding of findings) {
    const key = normalize(finding);
    if (key.length === 0) continue;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(finding.trim());
    }
  }

  return result;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a compact session digest from accumulated findings.
 *
 * Called after lu-executor completes a wave to summarize key findings
 * into a single digest that can be passed by ID to downstream agents.
 * Deduplicates findings and truncates to fit within the token budget.
 *
 * @param rawConfig - Configuration with findings array and phase ID
 * @returns Digest content string and suggested engram ID
 *
 * @example
 * ```typescript
 * const digest = createSessionDigest({
 *   findings: [
 *     "Bun APIs preferred over node:fs",
 *     "Schema-first validation works well for config parsing",
 *     "Bun APIs preferred over node:fs", // duplicate, will be removed
 *   ],
 *   phaseId: 4,
 * });
 * // digest.content: "## Session Digest (Phase 04)\n\n- Bun APIs preferred..."
 * // digest.engramId: "session:digest-04"
 * ```
 */
export function createSessionDigest(
  rawConfig: z.input<typeof SessionDigestConfigSchema>,
): SessionDigestResult {
  const config = SessionDigestConfigSchema.parse(rawConfig);

  const phaseStr =
    typeof config.phaseId === "number"
      ? String(config.phaseId).padStart(2, "0")
      : config.phaseId;

  const engramId = `session:digest-${phaseStr}`;

  const deduplicated = deduplicateFindings(config.findings);

  if (deduplicated.length === 0) {
    return {
      content: `## Session Digest (Phase ${phaseStr})\n\nNo findings recorded.`,
      engramId,
    };
  }

  // Build digest, trimming items from the end if over budget
  const header = `## Session Digest (Phase ${phaseStr})\n\n`;
  const headerTokens = estimateTokens(header);
  const remaining = config.maxTokens - headerTokens;

  const included: string[] = [];
  let usedTokens = 0;

  for (const finding of deduplicated) {
    const line = `- ${finding}`;
    const lineTokens = estimateTokens(line + "\n");

    if (usedTokens + lineTokens <= remaining) {
      included.push(line);
      usedTokens += lineTokens;
    } else {
      break;
    }
  }

  const omitted = deduplicated.length - included.length;
  const footer =
    omitted > 0 ? `\n\n_${omitted} additional finding(s) omitted._` : "";

  const content = `${header}${included.join("\n")}${footer}`;

  return { content, engramId };
}
