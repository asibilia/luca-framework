/**
 * CLI command group: `luca telemetry`
 *
 * The MINIMAL retained sink. General pipeline telemetry moved to LangSmith
 * (see `init/helpers/enrich-trace-metadata.ts`, gated on `TRACE_TO_LANGSMITH`);
 * what remains here is the recall-quality family LangSmith cannot observe, plus
 * the slug/wave records the `trace-insights` Stage A5 join reads.
 *
 * Leaves:
 *   - `telemetry emit` — append one `recall.*` record to
 *     `.luca/telemetry/<runId>.jsonl`
 *   - `telemetry kpi`  — compute artifact-derived outcome KPIs (reads no
 *     telemetry; lives here only because the KPI module is co-located)
 *
 * Retired leaves: `new-run` (superseded by `luca state new-run`, which mints
 * the same `state.sessionId`-shaped id) and `pr-outcome` (PR outcomes retired
 * with the bulk sink).
 */
import {
    appendTelemetry,
    computeOutcomeKpis,
    loadCurrentState,
    stringifyError,
} from '@alecsibilia/luca-core'
import type { OutcomeKpis, TelemetryContext } from '@alecsibilia/luca-core'
import { defineCommand } from 'citty'

import { logger } from '../utils/logger.ts'

const emitCommand = defineCommand({
    meta: {
        name: 'emit',
        description:
            'Append one recall.* telemetry record to ' +
            '.luca/telemetry/<runId>.jsonl.',
    },
    args: {
        kind: {
            type: 'string',
            required: true,
            description:
                'Event kind — recall.hit, recall.miss, or recall.utilization.',
        },
        'run-id': {
            type: 'string',
            required: true,
            description: 'Run identifier (see `luca state new-run`).',
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

const kpiCommand = defineCommand({
    meta: {
        name: 'kpi',
        description:
            'Compute complexity-bucketed outcome KPIs (low-confidence ratio, ' +
            'first-pass verify rate) from .luca/ phase artifacts. Read-only — ' +
            'reads no telemetry and appends none.',
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
                `n=${b.sampleSize}`
        )
    }
    lines.push(`  unattributed: ${kpis.unattributed.phases} phase(s)`)
    return lines.join('\n')
}

export const telemetryCommand = defineCommand({
    meta: {
        name: 'telemetry',
        description: 'Emit Luca recall-quality telemetry.',
    },
    subCommands: {
        emit: emitCommand,
        kpi: kpiCommand,
    },
})
