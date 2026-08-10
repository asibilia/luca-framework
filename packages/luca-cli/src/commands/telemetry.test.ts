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

import { logger } from '../utils/logger.ts'

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
                kind: 'recall.hit',
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

// ---------------------------------------------------------------------------
// The retained `emit` leaf — the minimal recall-quality sink
// ---------------------------------------------------------------------------

describe('telemetry emit leaf — retained recall sink', () => {
    let cwd: string
    let originalCwd: string

    beforeEach(() => {
        originalCwd = process.cwd()
        cwd = cleanDir()
        mkdirSync(join(cwd, '.luca'), { recursive: true })
        process.chdir(cwd)
    })

    afterEach(() => {
        process.chdir(originalCwd)
        for (const dir of tmpDirs.splice(0)) {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    const subCommands = telemetryCommand.subCommands as Record<string, unknown>

    test('emit is the only write leaf; new-run and pr-outcome are retired', () => {
        expect(subCommands.emit).toBeDefined()
        expect(subCommands['new-run']).toBeUndefined()
        expect(subCommands['pr-outcome']).toBeUndefined()
    })

    test('appends a recall.hit record to .luca/telemetry/<runId>.jsonl', () => {
        const leaf = subCommands.emit as {
            run: (ctx: { args: Record<string, unknown> }) => unknown
        }
        const successSpy = spyOn(logger, 'success').mockImplementation(() => {})
        try {
            leaf.run({
                args: {
                    kind: 'recall.hit',
                    'run-id': 'run_emit_test',
                    slug: '01-foo',
                    meta: JSON.stringify({ resultCount: 3, verifiedCount: 2 }),
                },
            })
        } finally {
            successSpy.mockRestore()
        }

        const log = readFileSync(
            join(cwd, '.luca', 'telemetry', 'run_emit_test.jsonl'),
            'utf-8'
        )
        const record = JSON.parse(log.trim()) as {
            kind: string
            runId: string
            slug: string | null
            meta: Record<string, unknown>
        }
        expect(record.kind).toBe('recall.hit')
        expect(record.runId).toBe('run_emit_test')
        // The slug field is what the trace-insights Stage A5 join resolves on.
        expect(record.slug).toBe('01-foo')
        expect(record.meta.verifiedCount).toBe(2)
    })
})
