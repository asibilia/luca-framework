/**
 * CLI command group: `luca confidence`
 *
 * Read and write the active phase's confidence journal.
 *
 * Leaves:
 *   - `confidence log`     — append a confidence entry (write-surface)
 *   - `confidence read`    — read every entry in a phase's confidence.jsonl
 *   - `confidence summary` — aggregate counts (total / high / medium / low / categories)
 *   - `confidence render`  — render the journal as Markdown
 *
 * F1 closure: the `log` leaf now accepts the FULL canonical
 * `ConfidenceEntrySchema` shape (phase, wave, task, confidence, category,
 * decision, alternatives, reasoning, risk, files, reviewHint?). The reader
 * leaves use luca-core's `ConfidenceEntrySchema` reader, so writer / reader
 * are round-trip exact. The v13 narrow `{score, stage, rationale}` shape is
 * REMOVED (breaking change per F1 design call).
 *
 * Input forms:
 *   - Flag-driven: every field as a CLI flag. `alternatives` and `files`
 *     are comma-separated. Suitable for one-off invocations.
 *   - File-driven: `--file <payload.json>` carries a single JSON object
 *     matching the canonical shape (minus `timestamp`, server-stamped).
 *     Preferred for structured callers — skills/agents construct the
 *     payload as a JSON object and pass the file path.
 */
import { defineCommand } from 'citty'

import {
    getConfidenceSummary,
    loadCurrentState,
    readConfidenceJournal,
    renderConfidenceJournalMarkdown,
    resolveActiveSlug,
    selectConfidenceGateActions,
} from '@alecsibilia/luca-core'

import { logger } from '../../utils/logger.ts'
import { lucaConfidenceLogTool } from '../../write-surface/index.ts'
import { readJsonPayload, runWriteHandler } from './__helpers/run-handler.ts'

/** Resolve the explicit `--slug` arg, or the active phase. Exits 1 if neither. */
async function resolveSlug(opts: {
    explicit: string | undefined
    cwd: string
}): Promise<string> {
    if (opts.explicit) return opts.explicit
    const state = await loadCurrentState({ cwd: opts.cwd })
    const r = resolveActiveSlug(state)
    if (!r.ok) {
        logger.error(`luca confidence: ${r.error}`)
        process.exit(1)
    }
    return r.slug
}

/** Split a comma-separated string into a trimmed, non-empty array. */
function splitCsv(input: string | undefined): string[] {
    if (!input) return []
    return input
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
}

const logCommand = defineCommand({
    meta: {
        name: 'log',
        description:
            "Append a confidence entry to the active phase's " +
            'confidence.jsonl (one JSONL line per call). Payload uses the ' +
            'canonical ConfidenceEntrySchema shape (phase, wave, task, ' +
            'confidence, category, decision, alternatives, reasoning, ' +
            'risk, files, reviewHint?). Phase-agnostic, but an active ' +
            'phase must exist.',
    },
    args: {
        // File-driven input (preferred for structured callers)
        file: {
            type: 'string',
            description:
                'Path to a JSON payload matching the canonical ' +
                'ConfidenceEntrySchema shape (minus `timestamp`, which is ' +
                'server-stamped). When set, all other flags below are ' +
                'ignored.',
        },
        // Flag-driven input (every field is also a CLI flag)
        phase: {
            type: 'string',
            description: 'Phase name from the plan / roadmap.',
        },
        wave: {
            type: 'string',
            description: 'Wave number within the phase (parsed as a number).',
        },
        task: {
            type: 'string',
            description: 'Task ID or description from the plan.',
        },
        confidence: {
            type: 'string',
            description: 'high | medium | low.',
        },
        category: {
            type: 'string',
            description:
                'One of: plan-gap, design-choice, convention-unclear, ' +
                'requirement-ambiguous, dependency-unknown, scope-creep.',
        },
        decision: {
            type: 'string',
            description: 'What the executor actually decided to do.',
        },
        alternatives: {
            type: 'string',
            description:
                'Comma-separated list of other options considered ' +
                '(e.g. `--alternatives="a,b,c"`).',
        },
        reasoning: {
            type: 'string',
            description: 'Why this choice was made over the alternatives.',
        },
        risk: {
            type: 'string',
            description: 'What could go wrong if this was the wrong call.',
        },
        files: {
            type: 'string',
            description:
                'Comma-separated list of files affected by this decision ' +
                '(e.g. `--files="src/a.ts,src/b.ts"`).',
        },
        'review-hint': {
            type: 'string',
            description:
                'Optional. Suggested focus area for a human reviewer.',
        },
        researchable: {
            type: 'boolean',
            description:
                'Optional. Set true when the ambiguity is factual and ' +
                'resolvable by automated research; absent/false means human ' +
                'judgment is required (gate routes to ask).',
        },
        resolution: {
            type: 'string',
            description:
                'Optional. Explicit gate routing override: auto | research | ask. ' +
                'Overrides confidence-derived bucketing when set.',
        },
    },
    async run({ args }) {
        let payload: Record<string, unknown>
        if (args.file) {
            const fromFile = await readJsonPayload('confidence log', args.file)
            if (typeof fromFile !== 'object' || fromFile === null || Array.isArray(fromFile)) {
                logger.error(
                    `luca confidence log: --file payload must be a JSON object.`
                )
                process.exit(1)
            }
            payload = fromFile as Record<string, unknown>
        } else {
            // Validate --resolution enum value when provided.
            const resolution = args.resolution as string | undefined
            if (
                resolution !== undefined &&
                resolution !== 'auto' &&
                resolution !== 'research' &&
                resolution !== 'ask'
            ) {
                logger.error(
                    `luca confidence log: --resolution must be one of: auto, research, ask (got "${resolution}"). Run \`luca confidence log --help\` for usage.`
                )
                process.exit(1)
            }

            // Flag-driven form — build the payload from individual flags.
            payload = {
                phase: args.phase,
                wave: args.wave !== undefined ? Number(args.wave) : undefined,
                task: args.task,
                confidence: args.confidence,
                category: args.category,
                decision: args.decision,
                alternatives: splitCsv(args.alternatives),
                reasoning: args.reasoning,
                risk: args.risk,
                files: splitCsv(args.files),
                ...(args['review-hint'] !== undefined
                    ? { reviewHint: args['review-hint'] }
                    : {}),
                ...(args.researchable !== undefined
                    ? { researchable: args.researchable }
                    : {}),
                ...(resolution !== undefined
                    ? { resolution }
                    : {}),
            }
        }

        await runWriteHandler(
            'confidence log',
            lucaConfidenceLogTool,
            payload
        )
    },
})

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description:
            'Read every entry in a phase\'s confidence.jsonl as a JSON array.',
    },
    args: {
        slug: {
            type: 'string',
            description: 'Phase slug to read (default: the active phase).',
        },
    },
    async run({ args }) {
        const cwd = process.cwd()
        const slug = await resolveSlug({ explicit: args.slug, cwd })
        const entries = readConfidenceJournal({ cwd, slug })
        process.stdout.write(`${JSON.stringify(entries, null, 2)}\n`)
    },
})

const summaryCommand = defineCommand({
    meta: {
        name: 'summary',
        description:
            'Print aggregate counts (total / high / medium / low / categories) ' +
            "for a phase's confidence journal.",
    },
    args: {
        slug: {
            type: 'string',
            description:
                'Phase slug to summarize (default: the active phase).',
        },
    },
    async run({ args }) {
        const cwd = process.cwd()
        const slug = await resolveSlug({ explicit: args.slug, cwd })
        const summary = getConfidenceSummary(
            readConfidenceJournal({ cwd, slug })
        )
        process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
    },
})

const renderCommand = defineCommand({
    meta: {
        name: 'render',
        description:
            "Render a phase's confidence journal as Markdown (stdout).",
    },
    args: {
        slug: {
            type: 'string',
            description: 'Phase slug to render (default: the active phase).',
        },
    },
    async run({ args }) {
        const cwd = process.cwd()
        const slug = await resolveSlug({ explicit: args.slug, cwd })
        const md = renderConfidenceJournalMarkdown(
            readConfidenceJournal({ cwd, slug })
        )
        process.stdout.write(`${md}\n`)
    },
})

const gateCommand = defineCommand({
    meta: {
        name: 'gate',
        description:
            "Bucket a phase's confidence entries into gate actions and " +
            'emit a JSON object shaped { auto: [...], research: [...], ' +
            'ask: [...], counts: { auto, research, ask } } to stdout. ' +
            'Each entry lands in exactly one bucket: explicit resolution ' +
            'overrides first, then high/medium → auto, low+researchable → ' +
            'research, otherwise → ask (fail-toward-human).',
    },
    args: {
        slug: {
            type: 'string',
            description: 'Phase slug (defaults to active phase).',
        },
    },
    async run({ args }) {
        const cwd = process.cwd()
        const slug = await resolveSlug({ explicit: args.slug, cwd })
        const actions = selectConfidenceGateActions(
            readConfidenceJournal({ cwd, slug })
        )
        process.stdout.write(`${JSON.stringify(actions, null, 2)}\n`)
    },
})

export const confidenceCommand = defineCommand({
    meta: {
        name: 'confidence',
        description:
            "Read and write the active phase's Luca confidence journal",
    },
    subCommands: {
        log: logCommand,
        read: readCommand,
        summary: summaryCommand,
        render: renderCommand,
        gate: gateCommand,
    },
})
