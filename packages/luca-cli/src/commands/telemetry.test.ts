import {
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test'

import { telemetryCommand } from './telemetry.ts'

// ---------------------------------------------------------------------------
// ac-05 / ac-06 — the read-only `kpi` leaf
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-telemetry-cli-'))
    tmpDirs.push(dir)
    return dir
}

/** Total JSONL line count across `.luca/telemetry/*.jsonl`. */
function telemetryLineCount(cwd: string): number {
    const dir = join(cwd, '.luca', 'telemetry')
    let total = 0
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        const content = readFileSync(join(dir, entry.name), 'utf-8')
        total += content.split('\n').filter((l) => l.trim()).length
    }
    return total
}

describe('telemetry kpi leaf', () => {
    let cwd: string
    let originalCwd: string

    beforeEach(() => {
        originalCwd = process.cwd()
        cwd = cleanDir()
        // Minimal state with an empty roadmap so the leaf can compute.
        mkdirSync(join(cwd, '.luca'), { recursive: true })
        writeFileSync(
            join(cwd, '.luca', 'state.json'),
            JSON.stringify({ roadmap: [] })
        )
        // Seed a telemetry log so a write would be observable as a line delta.
        const telemetryDir = join(cwd, '.luca', 'telemetry')
        mkdirSync(telemetryDir, { recursive: true })
        writeFileSync(
            join(telemetryDir, 'run_seed.jsonl'),
            `${JSON.stringify({
                v: 1,
                ts: new Date().toISOString(),
                runId: 'run_seed',
                kind: 'phase.start',
                phase: null,
                slug: null,
                wave: null,
                complexity: null,
                oversight: null,
                durationMs: null,
                meta: {},
            })}\n`
        )
        process.chdir(cwd)
    })

    afterEach(() => {
        process.chdir(originalCwd)
        for (const dir of tmpDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    // `subCommands` is typed as a Resolvable union; at authoring time it is the
    // plain object literal defined in telemetry.ts. Cast to read the leaf.
    const subCommands = telemetryCommand.subCommands as Record<string, unknown>

    test('is registered under telemetryCommand.subCommands (ac-05)', () => {
        expect(subCommands.kpi).toBeDefined()
    })

    test('run() appends ZERO telemetry — line count unchanged (ac-06)', async () => {
        const kpi = subCommands.kpi
        expect(kpi).toBeDefined()
        const runFn = (kpi as { run?: unknown }).run
        expect(typeof runFn).toBe('function')

        const before = telemetryLineCount(cwd)

        // Suppress stdout chatter from --json.
        const stdoutSpy = spyOn(process.stdout, 'write').mockReturnValue(true)
        try {
            await (
                runFn as (ctx: {
                    args: Record<string, unknown>
                    rawArgs: string[]
                    cmd: unknown
                }) => unknown
            )({ args: { json: true }, rawArgs: ['--json'], cmd: kpi })
        } finally {
            stdoutSpy.mockRestore()
        }

        const after = telemetryLineCount(cwd)
        expect(after).toBe(before)
    })
})
