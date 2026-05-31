/**
 * CLI command: `luca retro`
 *
 * Generates a structured postmortem for a Luca pipeline run — scanning the
 * run's session-ledger, verification results, and confidence entries for
 * seven classes of pipeline-discipline violation.
 *
 * This is a real generator, not a hollow reader: it closes §3 functional
 * gap #4 of the migration-recovery plan (`luca retro` was reduced to
 * printing a cached file; the analysis logic was lost in the v13 rewrite).
 *
 *   - `luca retro`              — postmortem for the most recent run
 *   - `luca retro --run <id>`   — postmortem for a specific run
 *   - `luca retro --list`       — list the runs recorded in the ledger
 *   - `luca retro --json`       — emit the full report as JSON (incl. pitfalls)
 */
import { defineCommand } from 'citty'

import {
    analyzeRun,
    computePostmortemExitCode,
    listRuns,
    renderPostmortemMarkdown,
} from '@alecsibilia/luca-core'

import { gatherRunArtifacts } from './__helpers/gather-run-artifacts.ts'
import { logger } from '../utils/logger.ts'

export const retroCommand = defineCommand({
    meta: {
        name: 'retro',
        description: 'Generate a postmortem for a Luca pipeline run.',
    },
    args: {
        run: {
            type: 'string',
            description:
                'Run id to analyze (default: the most recent run in the ledger).',
        },
        list: {
            type: 'boolean',
            description: 'List the runs recorded in .luca/ledger.jsonl.',
        },
        json: {
            type: 'boolean',
            description:
                'Emit the full PostmortemReport as JSON instead of Markdown.',
        },
    },
    run({ args }) {
        const cwd = process.cwd()
        const runs = listRuns({ cwd })

        if (args.list) {
            if (runs.length === 0) {
                logger.info('No runs recorded in .luca/ledger.jsonl.')
                return
            }
            for (const r of runs) {
                logger.info(
                    `${r.runId}  —  ${r.eventCount} event(s), ` +
                        `${r.firstEvent} → ${r.lastEvent}`
                )
            }
            return
        }

        if (runs.length === 0) {
            logger.warn(
                'No runs recorded in .luca/ledger.jsonl — nothing to analyze.'
            )
            return
        }

        let runId = args.run
        if (!runId) {
            // Most recent run, by last-event timestamp.
            runId = [...runs].sort((a, b) =>
                b.lastEvent.localeCompare(a.lastEvent)
            )[0]?.runId
        } else if (!runs.some((r) => r.runId === runId)) {
            logger.error(`luca retro: run '${runId}' not found in the ledger.`)
            process.exitCode = 1
            return
        }
        if (!runId) {
            logger.warn('Could not resolve a run to analyze.')
            return
        }

        const report = analyzeRun(gatherRunArtifacts({ cwd, runId }))

        if (args.json) {
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
        } else {
            process.stdout.write(`${renderPostmortemMarkdown(report)}\n`)
        }

        // CF5 — restore the mastracode exit-code semantic: exit 1 when
        // the report contains critical violations, 0 otherwise. CI
        // integrators depend on this to gate on pipeline-discipline
        // failures. We use `process.exitCode` (not `process.exit`) so
        // citty completes the command lifecycle cleanly and uses the
        // set code at process termination.
        process.exitCode = computePostmortemExitCode(report)
    },
})
