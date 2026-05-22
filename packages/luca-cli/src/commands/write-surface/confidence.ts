/**
 * CLI command group: `luca confidence`
 *
 * Append confidence-score entries to the active phase's confidence log.
 * Part of the v13 `luca` write surface (Phase B).
 *
 * Leaves:
 *   - `confidence log` — append a confidence entry (phase-agnostic)
 */
import { defineCommand } from 'citty'

import { lucaConfidenceLogTool } from '../../write-surface/index.ts'
import { readJsonPayload, runWriteHandler } from './__helpers/run-handler.ts'

const logCommand = defineCommand({
    meta: {
        name: 'log',
        description:
            "Append a confidence-score entry to the active phase's " +
            'confidence.jsonl (one JSONL line per call). Records ' +
            'subjective certainty at each stage. Phase-agnostic, but an ' +
            'active phase must exist.',
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

export const confidenceCommand = defineCommand({
    meta: {
        name: 'confidence',
        description: 'Log Luca workflow confidence scores',
    },
    subCommands: {
        log: logCommand,
    },
})
