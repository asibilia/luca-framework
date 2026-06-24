/**
 * CLI command group: `luca telemetry`
 *
 * Wires the luca-core telemetry writer to the CLI so skills and agents can
 * emit structured pipeline telemetry. Closes §3 functional gap #1 — the
 * `/luca-telemetry-report` reader skill existed but nothing wrote telemetry.
 *
 * Leaves:
 *   - `telemetry emit`    — append one record to `.luca/telemetry/<runId>.jsonl`
 *   - `telemetry new-run` — mint and print a fresh runId
 */
import {
    appendTelemetry,
    computeOutcomeKpis,
    generateRunId,
    loadCurrentState,
    stringifyError,
} from '@alecsibilia/luca-core'
import type { OutcomeKpis, TelemetryContext } from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'

import {
    rejectUnknownFlags,
    runWriteHandler,
} from './write-surface/__helpers/run-handler.ts'

import { logger } from '../utils/logger.ts'
import { lucaPrOutcomeTool } from '../write-surface/index.ts'

const emitCommand = defineCommand({
    meta: {
        name: 'emit',
        description:
            'Append one telemetry record to .luca/telemetry/<runId>.jsonl.',
    },
    args: {
        kind: {
            type: 'string',
            required: true,
            description:
                'Event kind, e.g. phase.start, wave.end, mode.start, recall.hit.',
        },
        'run-id': {
            type: 'string',
            required: true,
            description: 'Run identifier (see `luca telemetry new-run`).',
        },
        phase: { type: 'string', description: 'Phase name from the roadmap.' },
        slug: { type: 'string', description: 'Phase slug.' },
        wave: { type: 'string', description: 'Wave number.' },
        complexity: {
            type: 'string',
            description: 'Triage complexity classification.',
        },
        oversight: { type: 'string', description: 'Oversight mode.' },
        'duration-ms': {
            type: 'string',
            description: 'Duration in milliseconds (for .end events).',
        },
        meta: {
            type: 'string',
            description: 'Free-form per-event metadata as a JSON object.',
        },
    },
    run({ args }) {
        let meta: Record<string, unknown> = {}
        if (args.meta) {
            try {
                const parsed: unknown = JSON.parse(args.meta)
                if (
                    !parsed ||
                    typeof parsed !== 'object' ||
                    Array.isArray(parsed)
                ) {
                    throw new Error('not a JSON object')
                }
                meta = parsed as Record<string, unknown>
            } catch (err) {
                logger.error(
                    `luca telemetry emit: --meta is not a valid JSON object — ${stringifyError(
                        err
                    )}`
                )
                process.exitCode = 1
                return
            }
        }

        const ctx: TelemetryContext = {
            runId: args['run-id'],
            phase: args.phase ?? null,
            slug: args.slug ?? null,
            wave: args.wave !== undefined ? Number(args.wave) : null,
            complexity: args.complexity ?? null,
            oversight: args.oversight ?? null,
        }

        appendTelemetry({
            cwd: process.cwd(),
            kind: args.kind,
            ctx,
            meta,
            overrides:
                args['duration-ms'] !== undefined
                    ? { durationMs: Number(args['duration-ms']) }
                    : {},
        })
        logger.success(
            `telemetry: ${args.kind} emitted for run ${args['run-id']}.`
        )
    },
})

const newRunCommand = defineCommand({
    meta: {
        name: 'new-run',
        description: 'Mint and print a fresh telemetry run identifier.',
    },
    run() {
        process.stdout.write(`${generateRunId()}\n`)
    },
})

const prOutcomeCommand = defineCommand({
    meta: {
        name: 'pr-outcome',
        description:
            'Append a pr.outcome telemetry record to the fixed ' +
            'pr-outcomes.jsonl log. Explicit flags only — no `gh pr view` ' +
            'derivation. Correlates back to the pr.created run→PR map via ' +
            'prNumber.',
    },
    args: {
        'pr-number': {
            type: 'string',
            alias: 'pr',
            required: true,
            description: 'The PR number (join key to the pr.created map).',
        },
        result: {
            type: 'string',
            required: true,
            description: 'Terminal PR outcome: merged | reverted.',
        },
        'review-rounds': {
            type: 'string',
            required: true,
            description: 'How many review iterations the PR went through.',
        },
        'time-to-merge-ms': {
            type: 'string',
            required: true,
            description:
                'Wall-clock from PR open to merge/revert, in milliseconds.',
        },
        branch: {
            type: 'string',
            description: 'The feature branch the PR was opened from.',
        },
        issue: {
            type: 'string',
            description: 'The tracker issue number the PR closes.',
        },
        'origin-run-id': {
            type: 'string',
            description: "The originating session's runId, for correlation.",
        },
    },
    async run({ args, rawArgs, cmd }) {
        rejectUnknownFlags('telemetry pr-outcome', cmd, rawArgs)

        // Validate --result enum value with a friendly message before the
        // handler runs (mirrors the confidence leaf's --resolution guard).
        if (args.result !== 'merged' && args.result !== 'reverted') {
            logger.error(
                `luca telemetry pr-outcome: --result must be one of: merged, reverted (got "${args.result}"). Run \`luca telemetry pr-outcome --help\` for usage.`
            )
            process.exitCode = 1
            return
        }

        // Validate numeric flags up front. `Number("abc")` is NaN, which Zod's
        // `z.number()` accepts and then serializes as `null` in the JSONL —
        // silently corrupting telemetry and breaking the prNumber join. Reject
        // non-numeric input with a friendly error instead.
        const numericFlags: ReadonlyArray<
            [flag: string, raw: string | undefined]
        > = [
            ['--pr-number', args['pr-number']],
            ['--review-rounds', args['review-rounds']],
            ['--time-to-merge-ms', args['time-to-merge-ms']],
            ['--issue', args.issue],
        ]
        for (const [flag, raw] of numericFlags) {
            if (raw !== undefined && Number.isNaN(Number(raw))) {
                logger.error(
                    `luca telemetry pr-outcome: ${flag} must be a number (got "${raw}"). Run \`luca telemetry pr-outcome --help\` for usage.`
                )
                process.exitCode = 1
                return
            }
        }

        const payload = {
            prNumber:
                args['pr-number'] !== undefined
                    ? Number(args['pr-number'])
                    : undefined,
            result: args.result,
            reviewRounds:
                args['review-rounds'] !== undefined
                    ? Number(args['review-rounds'])
                    : undefined,
            timeToMergeMs:
                args['time-to-merge-ms'] !== undefined
                    ? Number(args['time-to-merge-ms'])
                    : undefined,
            ...(args.branch !== undefined ? { branch: args.branch } : {}),
            ...(args.issue !== undefined ? { issue: Number(args.issue) } : {}),
            ...(args['origin-run-id'] !== undefined
                ? { originRunId: args['origin-run-id'] }
                : {}),
        }
        await runWriteHandler(
            'telemetry pr-outcome',
            lucaPrOutcomeTool,
            payload
        )
    },
})

const kpiCommand = defineCommand({
    meta: {
        name: 'kpi',
        description:
            'Compute complexity-bucketed outcome KPIs (low-confidence ratio, ' +
            'first-pass verify rate, mean rework iterations, re-entry rate) ' +
            'from .luca/ artifacts. Read-only — appends no telemetry.',
    },
    args: {
        json: {
            type: 'boolean',
            description: 'Print the computed KPIs as JSON.',
        },
    },
    async run({ args }) {
        const cwd = process.cwd()
        const state = await loadCurrentState({ cwd })
        // Single compute serves both the JSON and the human render path.
        const kpis = computeOutcomeKpis({ cwd, roadmap: state.roadmap })
        if (args.json) {
            process.stdout.write(`${JSON.stringify(kpis, null, 2)}\n`)
        } else {
            process.stdout.write(`${renderOutcomeKpis(kpis)}\n`)
        }
    },
})

/** Format a ratio (0..1) as a fixed 2-decimal string. */
function fmtRatio(value: number): string {
    return value.toFixed(2)
}

/**
 * Render outcome KPIs as a compact human-readable summary — one line per
 * complexity bucket plus the unattributed tally. Pure: returns the string.
 */
function renderOutcomeKpis(kpis: OutcomeKpis): string {
    const lines: string[] = ['Outcome KPIs by complexity:']
    const complexities = Object.keys(kpis.buckets).sort()
    if (complexities.length === 0) {
        lines.push('  (no attributable phases yet)')
    }
    for (const complexity of complexities) {
        const b = kpis.buckets[complexity]
        if (!b) continue
        lines.push(
            `  ${complexity.padEnd(8)} ` +
                `lowConf=${fmtRatio(b.lowConfidenceRatio)} ` +
                `firstPass=${fmtRatio(b.firstPassVerifyRate)} ` +
                `rework=${b.meanReworkIterations.toFixed(2)} ` +
                `reEntry=${fmtRatio(b.reEntryRate)} ` +
                `n=${b.sampleSize}`
        )
    }
    lines.push(
        `  unattributed: ${kpis.unattributed.phases} phase(s), ` +
            `${kpis.unattributed.records} record(s)`
    )
    return lines.join('\n')
}

export const telemetryCommand = defineCommand({
    meta: {
        name: 'telemetry',
        description: 'Emit Luca pipeline telemetry.',
    },
    subCommands: {
        emit: emitCommand,
        'new-run': newRunCommand,
        'pr-outcome': prOutcomeCommand,
        kpi: kpiCommand,
    },
})
