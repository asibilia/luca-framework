import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import {
    appendConfidenceEntry,
    readConfidenceJournal,
    getConfidenceSummary,
    renderConfidenceJournalMarkdown,
} from '../confidence-journal.js'

export const confidenceJournalTool = createTool({
    id: 'confidence-journal',
    description:
        'Track execution-time decision confidence. Log entries when the executor encounters ambiguity, makes on-the-fly decisions, or lacks sufficient plan detail. Produces a reviewable `.planning/CONFIDENCE-JOURNAL.md` that highlights blocks needing human re-review.',
    inputSchema: z.object({
        action: z
            .enum(['log', 'read', 'summary', 'render'])
            .describe(
                'log: record a confidence entry | read: get all entries | summary: aggregate stats | render: regenerate Markdown file'
            ),
        entry: z
            .object({
                phase: z
                    .string()
                    .describe('Phase name from PLAN.md / ROADMAP.md'),
                wave: z.number().describe('Wave number within the phase'),
                task: z
                    .string()
                    .describe('Task ID or description from PLAN.md'),
                confidence: z
                    .enum(['high', 'medium', 'low'])
                    .describe(
                        'high: plan was clear, straightforward | medium: plan vague, made reasonable inference | low: plan gap, chose between alternatives with no clear winner'
                    ),
                category: z
                    .enum([
                        'plan-gap',
                        'design-choice',
                        'convention-unclear',
                        'requirement-ambiguous',
                        'dependency-unknown',
                        'scope-creep',
                    ])
                    .describe('What kind of ambiguity was encountered'),
                decision: z.string().describe('What was decided'),
                alternatives: z
                    .array(z.string())
                    .describe('Other options considered'),
                reasoning: z
                    .string()
                    .describe('Why this choice was made over alternatives'),
                risk: z
                    .string()
                    .describe('What could go wrong if this was the wrong call'),
                files: z.array(z.string()).describe('Affected file paths'),
                reviewHint: z
                    .string()
                    .optional()
                    .describe('Suggested focus area for human reviewer'),
            })
            .optional()
            .describe('Confidence entry to log (required for "log" action)'),
    }),
    execute: async (inputData) => {
        const { action, entry } = inputData

        switch (action) {
            case 'log': {
                if (!entry) {
                    return {
                        success: false,
                        message: 'entry is required for log action',
                    }
                }
                const written = appendConfidenceEntry(entry)
                // Auto-regenerate the Markdown rendering
                renderConfidenceJournalMarkdown()
                return {
                    success: true,
                    message: `Confidence entry logged (${entry.confidence} — ${entry.category}): ${entry.task}`,
                    entry: written as unknown as Record<string, unknown>,
                }
            }
            case 'read': {
                const entries = readConfidenceJournal()
                return {
                    success: true,
                    message: `${entries.length} confidence journal entries`,
                    entries: entries as unknown as Array<
                        Record<string, unknown>
                    >,
                }
            }
            case 'summary': {
                const summary = getConfidenceSummary()
                const lowWarning =
                    summary.low > 0
                        ? ` ⚠️ ${summary.low} low-confidence entries need human review.`
                        : ''
                return {
                    success: true,
                    message: `Confidence: ${summary.high} high, ${summary.medium} medium, ${summary.low} low (${summary.total} total).${lowWarning}`,
                    summary: summary as unknown as Record<string, unknown>,
                }
            }
            case 'render': {
                const md = renderConfidenceJournalMarkdown()
                return {
                    success: true,
                    message: `Rendered CONFIDENCE-JOURNAL.md (${md.length} chars)`,
                }
            }
            default:
                return { success: false, message: `Unknown action: ${action}` }
        }
    },
})
