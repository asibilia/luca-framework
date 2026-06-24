/**
 * Write-surface handler: `luca confidence log`.
 *
 * Appends a confidence entry to `.luca/phases/<active-slug>/confidence.jsonl`,
 * one JSON object per line. Callable in any pipelineStep — different agents
 * (planner, executor, verifier, reviewer) all contribute entries to the
 * same per-phase log.
 *
 * Schema (F1 fix): payloads now use the FULL canonical
 * `ConfidenceEntrySchema` shape exported from `@alecsibilia/luca-core/confidence`,
 * not the v13 narrow `{score, stage, rationale}` shape. The reader
 * (`readConfidenceJournal`) does `safeParse(JSON.parse(line))` against the
 * same canonical schema, so writer/reader are now round-trip exact.
 *
 * Per the F1 design call (parity-review §B1, R4 §3.7 / §4.1) this is a
 * BREAKING CHANGE — the v13 narrow shape goes away; no backward-compat
 * shim. Callers (skills/agents) construct payloads in the canonical shape
 * going forward.
 *
 * Caller ergonomics: the handler accepts a `--file <payload.json>` style
 * input (one JSON object matching the canonical shape, minus `timestamp` —
 * which the handler stamps server-side). The CLI leaf at
 * `commands/write-surface/confidence.ts` exposes both a flag-driven form
 * (every field as a CLI arg) and a `--file` form.
 */
import {
    appendConfidenceEntry,
    ConfidenceCategorySchema,
    ConfidenceLevelSchema,
    loadCurrentState,
    resolveActiveSlug,
} from '@alecsibilia/luca-core'

import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'

/**
 * Input schema for `luca_confidence_log` — mirrors the canonical
 * `ConfidenceEntrySchema` but omits `timestamp` (server-stamped).
 *
 * Field-for-field parity with `@alecsibilia/luca-core/confidence`'s
 * `ConfidenceEntrySchema`:
 *   - `phase`: phase name from the plan / roadmap.
 *   - `wave`: wave number within the phase.
 *   - `task`: task ID or description from the plan.
 *   - `confidence`: high | medium | low.
 *   - `category`: one of the closed-set ambiguity classifications.
 *   - `decision`: what the executor actually decided to do.
 *   - `alternatives`: other options that were considered.
 *   - `reasoning`: why this choice was made over the alternatives.
 *   - `risk`: what could go wrong if this was the wrong call.
 *   - `files`: which files were affected by this decision.
 *   - `reviewHint?`: suggested focus area for a human reviewer.
 *   - `researchable?`: true when the ambiguity is factual + auto-researchable.
 *   - `resolution?`: explicit gate-routing override (auto|research|ask).
 */
const inputSchema = z.object({
    phase: z.string().min(1).describe('Phase name from the plan / roadmap.'),
    wave: z.number().describe('Wave number within the phase.'),
    task: z.string().min(1).describe('Task ID or description from the plan.'),
    confidence: ConfidenceLevelSchema.describe(
        'How confident the executor was in its decision (high|medium|low).'
    ),
    category: ConfidenceCategorySchema.describe(
        'What kind of ambiguity was encountered.'
    ),
    decision: z
        .string()
        .min(1)
        .describe('What the executor actually decided to do.'),
    alternatives: z
        .array(z.string())
        .describe('Other options that were considered.'),
    reasoning: z
        .string()
        .min(1)
        .describe('Why this choice was made over the alternatives.'),
    risk: z
        .string()
        .min(1)
        .describe('What could go wrong if this was the wrong call.'),
    files: z
        .array(z.string())
        .describe('Which files were affected by this decision.'),
    reviewHint: z
        .string()
        .optional()
        .describe('Suggested focus area for a human reviewer.'),
    researchable: z
        .boolean()
        .optional()
        .describe(
            'Planning-time hint: true when the ambiguity is factual and ' +
                'resolvable by automated research; absent/false means human ' +
                'judgment is required (gate routes to ask).'
        ),
    resolution: z
        .enum(['auto', 'research', 'ask'])
        .optional()
        .describe(
            'Explicit gate-routing override. Overrides confidence-derived ' +
                'bucketing: auto=proceed, research=trigger research, ask=escalate.'
        ),
})

/**
 * Append a confidence entry to .luca/phases/<active-slug>/confidence.jsonl.
 * One JSON object per line. Callable in any pipelineStep — different agents
 * (planner, executor, verifier, reviewer) all contribute entries to the
 * same per-phase log.
 *
 * Delegates the actual append to luca-core's `appendConfidenceEntry`,
 * which stamps `timestamp` server-side and writes a single JSONL line.
 */
export const lucaConfidenceLogTool: ToolDescriptor<
    z.infer<typeof inputSchema>
> = {
    name: 'luca_confidence_log',
    description:
        "Append a confidence entry to the active phase's confidence.jsonl. One JSONL line per call. Payload matches the canonical ConfidenceEntrySchema (phase, wave, task, confidence, category, decision, alternatives, reasoning, risk, files, reviewHint?, researchable?, resolution?).",
    inputSchema,
    async handler(args, ctx) {
        const state = await loadCurrentState({ cwd: ctx.cwd })
        const slug = resolveActiveSlug(state)
        if (!slug.ok) {
            return {
                content: [{ type: 'text', text: slug.error }],
                isError: true,
            }
        }

        const entry = appendConfidenceEntry({
            cwd: ctx.cwd,
            slug: slug.slug,
            entry: {
                phase: args.phase,
                wave: args.wave,
                task: args.task,
                confidence: args.confidence,
                category: args.category,
                decision: args.decision,
                alternatives: args.alternatives,
                reasoning: args.reasoning,
                risk: args.risk,
                files: args.files,
                ...(args.reviewHint !== undefined
                    ? { reviewHint: args.reviewHint }
                    : {}),
                ...(args.researchable !== undefined
                    ? { researchable: args.researchable }
                    : {}),
                ...(args.resolution !== undefined
                    ? { resolution: args.resolution }
                    : {}),
            },
        })

        return {
            content: [
                {
                    type: 'text',
                    text: `appended confidence entry (${entry.confidence}, ${entry.category}) to phase '${slug.slug}' (task: ${entry.task})`,
                },
            ],
        }
    },
}
