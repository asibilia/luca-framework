/**
 * Luca Scout pipeline document templates.
 *
 * Provides factory functions that generate markdown documents for each stage
 * of the Scout pipeline: digest, impact analysis, integration analysis,
 * deferred items, and manual review items. Each template returns a structured
 * markdown string ready for writing to disk.
 *
 * All templates are pure functions with no side effects.
 *
 * @module scout-templates
 */

// ─── Status Constants ─────────────────────────────────────────────────────────

/**
 * Valid status values for scout items throughout the pipeline lifecycle.
 *
 * Statuses flow left-to-right through the pipeline stages:
 * - pending: newly queued, not yet processed
 * - digested: Stage 2 complete (summary extracted)
 * - researched: Stage 3 complete (related work investigated)
 * - analyzed: Stage 4 complete (impact assessed)
 * - impl-researched: Stage 5 complete (implementation approaches identified)
 * - ready: approved for integration into the framework
 * - integrated: successfully merged into the codebase
 * - deferred: valid but postponed to a future milestone
 * - low-relevance: filtered out as not applicable
 * - conflicting: conflicts with existing todos or architecture
 *
 * @example
 * ```typescript
 * import { SCOUT_STATUS_VALUES } from '~/skills/__helpers/scout-templates'
 *
 * const isValidStatus = (s: string): s is ScoutStatus =>
 *   (SCOUT_STATUS_VALUES as readonly string[]).includes(s)
 *
 * isValidStatus('digested')     // true
 * isValidStatus('invalid')      // false
 * ```
 */
export const SCOUT_STATUS_VALUES = [
  "pending",
  "digested",
  "researched",
  "analyzed",
  "impl-researched",
  "ready",
  "integrated",
  "deferred",
  "low-relevance",
  "conflicting",
] as const;

/**
 * Type derived from SCOUT_STATUS_VALUES for compile-time safety.
 */
export type ScoutStatus = (typeof SCOUT_STATUS_VALUES)[number];

// ─── Digest Template ──────────────────────────────────────────────────────────

/**
 * Create a per-article digest document.
 *
 * Generated during Stage 2 (Digest) of the Scout pipeline. Contains
 * placeholder sections for summary, key concepts, and techniques that
 * the digest agent fills in. Stages 3 (Research) appends Related Work
 * and Technique Deep-Dive sections.
 *
 * @param params - Digest template parameters
 * @param params.url - Source URL of the scouted article
 * @param params.title - Human-readable article title
 * @param params.date_scouted - ISO date string when the article was scouted
 * @param params.status - Current pipeline status from SCOUT_STATUS_VALUES
 * @returns Markdown string for the digest document
 *
 * @example
 * ```typescript
 * import { createDigestTemplate } from '~/skills/__helpers/scout-templates'
 *
 * const markdown = createDigestTemplate({
 *   url: 'https://example.com/article',
 *   title: 'Agentic Loop Patterns for LLM Tooling',
 *   date_scouted: '2026-03-30',
 *   status: 'pending',
 * })
 * // Returns a markdown string with frontmatter and placeholder sections
 * ```
 */
export const createDigestTemplate = (params: {
  url: string;
  title: string;
  date_scouted: string;
  status: string;
}): string => `# Scout Digest: ${params.title}

**Source:** ${params.url}
**Date Scouted:** ${params.date_scouted}
**Status:** ${params.status}

---

## Summary

<!-- 3-5 sentence summary of the article's key points -->

## Key Concepts

<!-- Bulleted list of main concepts introduced or discussed -->

## Techniques & Patterns

<!-- Specific techniques, patterns, or approaches described -->

## Related Work

<!-- Added by Stage 3: Research — related projects, papers, implementations -->

## Technique Deep-Dive

<!-- Added by Stage 3: Research — detailed investigation of key techniques -->
`;

// ─── Impact Template ──────────────────────────────────────────────────────────

/**
 * Create a framework impact analysis document.
 *
 * Generated during Stage 4 (Impact Analysis) of the Scout pipeline.
 * Evaluates how the scouted content maps to current framework capabilities,
 * identifies gaps, and proposes improvement areas. Stage 5 (Implementation
 * Research) appends the Implementation Approaches section.
 *
 * @param params - Impact template parameters
 * @param params.slug - Kebab-case identifier for the scout item
 * @param params.digest_path - Relative path to the corresponding digest document
 * @param params.relevance - Relevance score or label (e.g., "high", "medium", "low")
 * @param params.date - ISO date string when the impact analysis was created
 * @returns Markdown string for the impact analysis document
 *
 * @example
 * ```typescript
 * import { createImpactTemplate } from '~/skills/__helpers/scout-templates'
 *
 * const markdown = createImpactTemplate({
 *   slug: 'agentic-loop-patterns',
 *   digest_path: '.planning/scout/digests/agentic-loop-patterns.md',
 *   relevance: 'high',
 *   date: '2026-03-30',
 * })
 * ```
 */
export const createImpactTemplate = (params: {
  slug: string;
  digest_path: string;
  relevance: string;
  date: string;
}): string => `# Impact Analysis: ${params.slug}

**Source Digest:** ${params.digest_path}
**Relevance Score:** ${params.relevance}
**Date:** ${params.date}

---

## Framework Gap Analysis

| Area | Current State | Potential Improvement | Effort |
|------|---------------|----------------------|--------|
| <!-- area --> | <!-- current --> | <!-- improvement --> | <!-- effort --> |

## Applicable Patterns

<!-- Patterns from the digest that map to framework capabilities -->

## Implementation Approaches

<!-- Added by Stage 5: Implementation Research — concrete approaches with trade-offs -->

## Recommended Actions

- [ ] <!-- action 1 -->
- [ ] <!-- action 2 -->
- [ ] <!-- action 3 -->
`;

// ─── Integration Template ─────────────────────────────────────────────────────

/**
 * Create a cross-cutting batch integration analysis document.
 *
 * Generated during Stage 6 (Integration) of the Scout pipeline. Analyzes
 * a batch of scout items together to find cross-cutting themes, assess
 * overall framework fit, and produce a priority-ordered integration plan.
 *
 * @param params - Integration template parameters
 * @param params.batch_id - Unique identifier for this integration batch
 * @param params.date - ISO date string when the integration analysis was created
 * @param params.scout_slugs - Array of scout slug identifiers included in the batch
 * @returns Markdown string for the integration analysis document
 *
 * @example
 * ```typescript
 * import { createIntegrationTemplate } from '~/skills/__helpers/scout-templates'
 *
 * const markdown = createIntegrationTemplate({
 *   batch_id: 'batch-2026-03-30',
 *   date: '2026-03-30',
 *   scout_slugs: ['agentic-loop-patterns', 'memory-graph-pruning', 'tool-use-guardrails'],
 * })
 * ```
 */
export const createIntegrationTemplate = (params: {
  batch_id: string;
  date: string;
  scout_slugs: string[];
}): string => {
  const scoutList = params.scout_slugs.map((s) => `- ${s}`).join("\n");

  return `# Integration Analysis: ${params.batch_id}

**Date:** ${params.date}

---

## Scouts Included

${scoutList}

## Cross-Scout Cohesion Analysis

<!-- Themes, patterns, or techniques that appear across multiple scouts -->

## Framework Fit Assessment

<!-- How well the batch of scouts aligns with framework direction and architecture -->

## Integration Priority Ordering

<!-- Ordered list of scouts by integration priority, with rationale -->

## Per-Scout Verdicts

| Scout | Verdict | Reasoning |
|-------|---------|-----------|
${params.scout_slugs.map((s) => `| ${s} | <!-- verdict --> | <!-- reasoning --> |`).join("\n")}
`;
};

// ─── Deferred Template ────────────────────────────────────────────────────────

/**
 * Create a deferred item document.
 *
 * Generated when a scout item is valid but intentionally postponed to a
 * future milestone. Links back to the original digest and impact analysis
 * so the item can be revisited without re-processing.
 *
 * @param params - Deferred template parameters
 * @param params.slug - Kebab-case identifier for the scout item
 * @param params.title - Human-readable title of the original article
 * @param params.digest_path - Relative path to the digest document
 * @param params.impact_path - Relative path to the impact analysis document
 * @param params.date - ISO date string when the item was deferred
 * @returns Markdown string for the deferred item document
 *
 * @example
 * ```typescript
 * import { createDeferredTemplate } from '~/skills/__helpers/scout-templates'
 *
 * const markdown = createDeferredTemplate({
 *   slug: 'memory-graph-pruning',
 *   title: 'Efficient Graph Pruning for Long-Term Agent Memory',
 *   digest_path: '.planning/scout/digests/memory-graph-pruning.md',
 *   impact_path: '.planning/scout/impact/memory-graph-pruning.md',
 *   date: '2026-03-30',
 * })
 * ```
 */
export const createDeferredTemplate = (params: {
  slug: string;
  title: string;
  digest_path: string;
  impact_path: string;
  date: string;
}): string => `# Deferred: ${params.title}

**Slug:** ${params.slug}
**Date Deferred:** ${params.date}

---

## Original Links

- **Digest:** ${params.digest_path}
- **Impact Analysis:** ${params.impact_path}

## Why Deferred

<!-- Reason this item was postponed rather than integrated or discarded -->

## Conditions to Revisit

<!-- Specific triggers or milestones that would make this item actionable -->

## Value If Implemented

<!-- Expected benefit to the framework if this item is eventually integrated -->
`;

// ─── Manual Review Template ───────────────────────────────────────────────────

/**
 * Allowed reasons for routing a scout item to manual review.
 */
export type ManualReviewReason =
  | "low-relevance"
  | "todo-conflict"
  | "fetch-failed";

/**
 * Create a manual review item document.
 *
 * Generated when a scout item cannot proceed through automated pipeline
 * stages and requires human judgment. Includes the reason for escalation
 * and space for reviewer notes.
 *
 * @param params - Manual review template parameters
 * @param params.slug - Kebab-case identifier for the scout item
 * @param params.title - Human-readable title of the original article
 * @param params.url - Source URL of the scouted article
 * @param params.reason - Why the item was routed to manual review
 * @param params.date - ISO date string when the item was flagged for review
 * @returns Markdown string for the manual review document
 *
 * @example
 * ```typescript
 * import { createManualReviewTemplate } from '~/skills/__helpers/scout-templates'
 *
 * const markdown = createManualReviewTemplate({
 *   slug: 'broken-link-article',
 *   title: 'Advanced Prompt Chaining Techniques',
 *   url: 'https://example.com/dead-link',
 *   reason: 'fetch-failed',
 *   date: '2026-03-30',
 * })
 * ```
 */
export const createManualReviewTemplate = (params: {
  slug: string;
  title: string;
  url: string;
  reason: ManualReviewReason;
  date: string;
}): string => {
  const reasonDescriptions: Record<ManualReviewReason, string> = {
    "low-relevance":
      "Automated analysis scored this item below the relevance threshold. A human reviewer should confirm whether the content is truly irrelevant or contains subtle applicability.",
    "todo-conflict":
      "This item conflicts with one or more existing todo items or planned work. A human reviewer should determine whether the conflict is real and how to resolve it.",
    "fetch-failed":
      "The source URL could not be fetched during automated processing. A human reviewer should verify the URL, attempt manual access, or provide the content through an alternative source.",
  };

  return `# Manual Review: ${params.title}

**Slug:** ${params.slug}
**Date Flagged:** ${params.date}

---

## Reason for Review

**Type:** ${params.reason}

${reasonDescriptions[params.reason]}

## Source Info

- **URL:** ${params.url}
- **Title:** ${params.title}

## Notes for Reviewer

<!-- Add observations, decisions, and next steps here -->
`;
};
