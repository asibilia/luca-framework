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
import { defineCommand } from 'citty'

import { appendTelemetry, generateRunId } from '@alecsibilia/luca-core'
import type { TelemetryContext } from '@alecsibilia/luca-core'

import { logger } from '../utils/logger.ts'

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
                    `luca telemetry emit: --meta is not a valid JSON object — ${
                        err instanceof Error ? err.message : String(err)
                    }`
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

export const telemetryCommand = defineCommand({
    meta: {
        name: 'telemetry',
        description: 'Emit Luca pipeline telemetry.',
    },
    subCommands: {
        emit: emitCommand,
        'new-run': newRunCommand,
    },
})
