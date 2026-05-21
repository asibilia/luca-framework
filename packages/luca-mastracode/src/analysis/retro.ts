#!/usr/bin/env bun
/**
 * Luca retro — retrospective inspection CLI for a Luca pipeline run.
 *
 * Reads `.planning/` artifacts in the current working directory and prints
 * either:
 *   • the rendered POSTMORTEM.md (default), or
 *   • a list of archived runs (`--list`), or
 *   • a structured JSON report (`--json`).
 *
 * This entrypoint is intentionally separate from `launch.ts` so that
 * `luca retro` can run without booting the full Mastra harness.
 *
 * Usage:
 *   bun run packages/luca-mastracode/src/retro.ts            # current run
 *   bun run packages/luca-mastracode/src/retro.ts --list     # list runs
 *   bun run packages/luca-mastracode/src/retro.ts --run <id> # specific run
 *   bun run packages/luca-mastracode/src/retro.ts --json     # JSON report
 */
import { analyzeRun, renderPostmortemMarkdown } from './postmortem.js'

import { listRuns, listArchivedRuns } from '../state/session-ledger.js'

interface ParsedArgs {
    list: boolean
    json: boolean
    runId?: string
    help: boolean
}

function parseArgs(argv: string[]): ParsedArgs {
    const out: ParsedArgs = { list: false, json: false, help: false }
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--list') out.list = true
        else if (a === '--json') out.json = true
        else if (a === '--help' || a === '-h') out.help = true
        else if (a === '--run' || a === '--run-id') {
            const next = argv[i + 1]
            if (next && !next.startsWith('--')) {
                out.runId = next
                i++
            }
        }
    }
    return out
}

function printHelp(): void {
    console.log(
        [
            'luca retro — inspect a Luca pipeline run',
            '',
            'Reads `.planning/` artifacts in the current working directory.',
            '',
            'Usage:',
            '  luca retro                 Render the current run as Markdown',
            '  luca retro --list          List archived runs in the ledger',
            '  luca retro --run <id>      Render a specific run',
            '  luca retro --json          Emit the structured report as JSON',
            '  luca retro --help          Show this help',
        ].join('\n')
    )
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
    printHelp()
    process.exit(0)
}

if (args.list) {
    // Live runs: present in the current `.planning/session-ledger.jsonl`.
    // Archived runs: directories under `.planning/runs/` from previous
    // pipeline-reset archival. Both are valid targets for `--run <id>`.
    const liveRuns = listRuns()
    const liveIds = new Set(liveRuns.map((r) => r.runId))
    const archivedOnly = listArchivedRuns().filter((id) => !liveIds.has(id))

    if (liveRuns.length === 0 && archivedOnly.length === 0) {
        console.log(
            'No runs recorded in .planning/session-ledger.jsonl or .planning/runs/.'
        )
        process.exit(0)
    }

    if (liveRuns.length > 0) {
        const sorted = [...liveRuns].sort((a, b) =>
            a.firstEvent.localeCompare(b.firstEvent)
        )
        console.log('Live runs (in current ledger):')
        for (const r of sorted) {
            console.log(
                `  ${r.runId}  events=${r.eventCount}  ${r.firstEvent} → ${r.lastEvent}`
            )
        }
    }

    if (archivedOnly.length > 0) {
        if (liveRuns.length > 0) console.log('')
        console.log('Archived runs (in .planning/runs/):')
        for (const id of [...archivedOnly].sort()) {
            console.log(`  ${id}`)
        }
    }
    process.exit(0)
}

const report = analyzeRun(args.runId)

if (args.json) {
    console.log(JSON.stringify(report, null, 2))
    process.exit(0)
}

console.log(renderPostmortemMarkdown(report))
const critical = report.violations.filter((v) => v.severity === 'critical')
process.exit(critical.length > 0 ? 1 : 0)
