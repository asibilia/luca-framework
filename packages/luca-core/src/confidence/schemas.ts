/**
 * Confidence journal schema.
 *
 * During execution, when an executor encounters ambiguity, makes an on-the-fly
 * decision, or lacks plan detail, it logs a confidence entry. The journal
 * highlights which blocks need human re-review.
 *
 * Ported from luca-mastracode `state/confidence-journal.ts`.
 */
import { z } from 'zod'

/** How confident the executor was in a decision. */
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low'])
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>

/** What kind of ambiguity the executor encountered. */
export const ConfidenceCategorySchema = z.enum([
    'plan-gap',
    'design-choice',
    'convention-unclear',
    'requirement-ambiguous',
    'dependency-unknown',
    'scope-creep',
])
export type ConfidenceCategory = z.infer<typeof ConfidenceCategorySchema>

/** A single execution-time decision-confidence entry. */
export const ConfidenceEntrySchema = z.object({
    /** Event timestamp (ISO 8601). */
    timestamp: z.iso.datetime(),
    /** Phase name from the plan / roadmap. */
    phase: z.string(),
    /** Wave number within the phase. */
    wave: z.number(),
    /** Task ID or description from the plan. */
    task: z.string(),
    /** How confident the executor was in its decision. */
    confidence: ConfidenceLevelSchema,
    /** What kind of ambiguity was encountered. */
    category: ConfidenceCategorySchema,
    /** What the executor actually decided to do. */
    decision: z.string(),
    /** Other options that were considered. */
    alternatives: z.array(z.string()),
    /** Why this choice was made over the alternatives. */
    reasoning: z.string(),
    /** What could go wrong if this was the wrong call. */
    risk: z.string(),
    /** Which files were affected by this decision. */
    files: z.array(z.string()),
    /** Suggested focus area for a human reviewer. */
    reviewHint: z.string().optional(),
})
export type ConfidenceEntry = z.infer<typeof ConfidenceEntrySchema>

/** Aggregate confidence statistics. */
export interface ConfidenceSummary {
    total: number
    high: number
    medium: number
    low: number
    categories: Record<string, number>
}
