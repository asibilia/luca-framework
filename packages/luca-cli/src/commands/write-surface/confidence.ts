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
 * The `log` leaf writes the v13 `{score, stage, rationale}` shape; the
 * read leaves use luca-core's `ConfidenceEntrySchema` reader. Audit finding
 * F1 (docs/repo-restructure-dropped-actions-audit.md) flags the schema
 * divergence — readers will drop log-written entries until F1 is resolved.
 */
import { defineCommand } from 'citty'

import {
    getConfidenceSummary,
    loadCurrentState,
    readConfidenceJournal,
    renderConfidenceJournalMarkdown,
    resolveActiveSlug,
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

const logCommand = defineCommand({
    meta: {
        name: 'log',
        description:
            "Append a confidence-score entry to the active phase's " +
            'confidence.jsonl (one JSONL line per call). Records subjective ' +
            'certainty at each stage. Phase-agnostic, but an active phase ' +
            'must exist.',
    },
    args: {
        score: {
            type: 'string',
            required: true,
            description:
                'Confidence score in [0,1]: 0 = no confidence, 1 = certain.',
        },
        stage: {
            type: 'string',
            required: true,
            description:
                'Pipeline stage this confidence was recorded at (e.g. ' +
                'plan, execute, verify, review).',
        },
        rationale: {
            type: 'string',
            required: true,
            description:
                'Free-text justification for the score — what raised or ' +
                'lowered confidence.',
        },
        'metadata-file': {
            type: 'string',
            description:
                'Optional path to a JSON file of structured fields to ' +
                'capture alongside the score.',
        },
    },
    async run({ args }) {
        const metadata = args['metadata-file']
            ? await readJsonPayload('confidence log', args['metadata-file'])
            : undefined
        await runWriteHandler('confidence log', lucaConfidenceLogTool, {
            score: Number(args.score),
            stage: args.stage,
            rationale: args.rationale,
            metadata,
        })
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
    },
})
