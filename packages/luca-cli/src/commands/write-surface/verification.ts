/**
 * CLI command group: `luca verification`
 *
 * Read-side surfaces over the per-phase `verify.json` files written by the
 * `luca-phase-write-verify` handler. Closes audit finding F2 — the
 * mastracode `verification-result` tool's `read` and `aggregate` actions
 * had no v13 counterparts.
 *
 * Leaves:
 *   - `verification read`      — read one phase's verify.json as JSON
 *   - `verification aggregate` — aggregate every phase's verify.json
 *     (totalWaves / passCount / failCount / stalledCount / allCriteriaMet /
 *     blockingGaps). Useful at finalize / milestone.
 */
import { defineCommand } from 'citty'

import {
    aggregateVerificationResults,
    loadCurrentState,
    readVerificationResult,
    resolveActiveSlug,
} from '@alecsibilia/luca-core'
import type { VerificationResult } from '@alecsibilia/luca-core'

import { listPhaseSlugs } from '../__helpers/list-phase-slugs.ts'
import { logger } from '../../utils/logger.ts'

/** Resolve the explicit `--slug` arg, or the active phase. Exits 1 if neither. */
async function resolveSlug(opts: {
    explicit: string | undefined
    cwd: string
}): Promise<string> {
    if (opts.explicit) return opts.explicit
    const state = await loadCurrentState({ cwd: opts.cwd })
    const r = resolveActiveSlug(state)
    if (!r.ok) {
        logger.error(`luca verification: ${r.error}`)
        process.exit(1)
    }
    return r.slug
}

const readCommand = defineCommand({
    meta: {
        name: 'read',
        description:
            "Read a phase's verify.json as JSON (null if no result exists).",
    },
    args: {
        slug: {
            type: 'string',
            description: 'Phase slug to read (default: the active phase).',
        },
        'run-id': {
            type: 'string',
            description:
                'Current run id. When set, results whose stamped runId does ' +
                'not match are treated as stale and yield null.',
        },
    },
    async run({ args }) {
        const cwd = process.cwd()
        const slug = await resolveSlug({ explicit: args.slug, cwd })
        const result = readVerificationResult({
            cwd,
            slug,
            currentRunId: args['run-id'],
        })
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    },
})

const aggregateCommand = defineCommand({
    meta: {
        name: 'aggregate',
        description:
            "Aggregate every phase's verify.json into milestone-level stats " +
            '(totalWaves, passCount, failCount, stalledCount, allCriteriaMet, ' +
            'blockingGaps from the latest result).',
    },
    args: {
        'run-id': {
            type: 'string',
            description:
                'Current run id; filters out stale per-phase verify.json.',
        },
    },
    run({ args }) {
        const cwd = process.cwd()
        const results: VerificationResult[] = []
        for (const slug of listPhaseSlugs(cwd)) {
            const result = readVerificationResult({
                cwd,
                slug,
                currentRunId: args['run-id'],
            })
            if (result) results.push(result)
        }
        process.stdout.write(
            `${JSON.stringify(aggregateVerificationResults(results), null, 2)}\n`
        )
    },
})

export const verificationCommand = defineCommand({
    meta: {
        name: 'verification',
        description:
            'Read and aggregate Luca workflow verification results.',
    },
    subCommands: {
        read: readCommand,
        aggregate: aggregateCommand,
    },
})
