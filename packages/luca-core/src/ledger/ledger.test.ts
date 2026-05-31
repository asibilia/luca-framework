import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { LedgerEntrySchema } from './schemas.ts'
import {
    appendLedger,
    computeSessionMetrics,
    getLedgerByEvent,
    listRuns,
    readLedger,
    readLedgerForRun,
} from './ledger.ts'

const tmpDirs: string[] = []

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-ledger-'))
    tmpDirs.push(dir)
    return dir
}

/** Seed `.luca/ledger.jsonl` with hand-crafted entries (controlled timestamps). */
function seedLedger(cwd: string, entries: object[]): void {
    const dir = join(cwd, '.luca')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
        join(dir, 'ledger.jsonl'),
        `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`
    )
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('appendLedger + readLedger', () => {
    test('creates .luca/ledger.jsonl and writes one entry', () => {
        const cwd = cleanDir()
        appendLedger({
            cwd,
            runId: 'run_a',
            event: 'mode-transition',
            data: { to: 'execute' },
        })
        const entries = readLedger({ cwd })
        expect(entries.length).toBe(1)
        expect(entries[0]?.event).toBe('mode-transition')
        expect(entries[0]?.runId).toBe('run_a')
        expect(entries[0]?.data).toEqual({ to: 'execute' })
    })

    test('appends entries in order', () => {
        const cwd = cleanDir()
        appendLedger({ cwd, runId: 'run_a', event: 'one' })
        appendLedger({ cwd, runId: 'run_a', event: 'two' })
        expect(readLedger({ cwd }).map((e) => e.event)).toEqual(['one', 'two'])
    })

    test('readLedger returns [] when the file is absent', () => {
        expect(readLedger({ cwd: cleanDir() })).toEqual([])
    })

    test('readLedger skips malformed lines', () => {
        const cwd = cleanDir()
        appendLedger({ cwd, runId: 'run_a', event: 'good' })
        const p = join(cwd, '.luca', 'ledger.jsonl')
        writeFileSync(
            p,
            `${readFileSync(p, 'utf-8')}not json\n` +
                `${JSON.stringify({ timestamp: 'nope', runId: 'x', event: 'y', data: {} })}\n`
        )
        const entries = readLedger({ cwd })
        expect(entries.length).toBe(1)
        expect(entries[0]?.event).toBe('good')
    })

    test('defaults data to {} when omitted', () => {
        const cwd = cleanDir()
        appendLedger({ cwd, runId: 'run_a', event: 'bare' })
        expect(readLedger({ cwd })[0]?.data).toEqual({})
    })
})

describe('readLedgerForRun + getLedgerByEvent', () => {
    test('readLedgerForRun scopes to a single run', () => {
        const cwd = cleanDir()
        appendLedger({ cwd, runId: 'run_a', event: 'x' })
        appendLedger({ cwd, runId: 'run_b', event: 'y' })
        appendLedger({ cwd, runId: 'run_a', event: 'z' })
        expect(
            readLedgerForRun({ cwd, runId: 'run_a' }).map((e) => e.event)
        ).toEqual(['x', 'z'])
    })

    test('getLedgerByEvent filters by event, optionally scoped to a run', () => {
        const cwd = cleanDir()
        appendLedger({ cwd, runId: 'run_a', event: 'phase-complete' })
        appendLedger({ cwd, runId: 'run_a', event: 'mode-transition' })
        appendLedger({ cwd, runId: 'run_b', event: 'phase-complete' })
        expect(getLedgerByEvent({ cwd, event: 'phase-complete' }).length).toBe(2)
        expect(
            getLedgerByEvent({ cwd, event: 'phase-complete', runId: 'run_b' })
                .length
        ).toBe(1)
    })
})

describe('listRuns', () => {
    test('summarizes distinct runs with event counts', () => {
        const cwd = cleanDir()
        appendLedger({ cwd, runId: 'run_a', event: 'x' })
        appendLedger({ cwd, runId: 'run_a', event: 'y' })
        appendLedger({ cwd, runId: 'run_b', event: 'z' })
        const runs = listRuns({ cwd })
        expect(runs.length).toBe(2)
        expect(runs.find((r) => r.runId === 'run_a')?.eventCount).toBe(2)
        expect(runs.find((r) => r.runId === 'run_b')?.eventCount).toBe(1)
    })
})

describe('computeSessionMetrics', () => {
    test('returns zeroed metrics for an empty ledger', () => {
        const m = computeSessionMetrics({ cwd: cleanDir() })
        expect(m.totalEvents).toBe(0)
        expect(m.modeTransitions).toBe(0)
        expect(m.phasesCompleted).toBe(0)
        expect(m.totalIterations).toBe(0)
    })

    test('counts transitions, completions, iterations and duration', () => {
        const cwd = cleanDir()
        seedLedger(cwd, [
            {
                timestamp: '2026-05-22T10:00:00.000Z',
                runId: 'run_a',
                event: 'mode-transition',
                data: {},
            },
            {
                timestamp: '2026-05-22T10:00:05.000Z',
                runId: 'run_a',
                event: 'phase-complete',
                data: {},
            },
            {
                timestamp: '2026-05-22T10:00:09.000Z',
                runId: 'run_a',
                event: 'iteration-complete',
                data: {},
            },
        ])
        const m = computeSessionMetrics({ cwd, runId: 'run_a' })
        expect(m.totalEvents).toBe(3)
        expect(m.modeTransitions).toBe(1)
        expect(m.phasesCompleted).toBe(1)
        expect(m.totalIterations).toBe(1)
        expect(m.durationMs).toBe(9000)
    })
})

describe('LedgerEntrySchema', () => {
    test('rejects an entry missing the event field', () => {
        expect(
            LedgerEntrySchema.safeParse({
                timestamp: new Date().toISOString(),
                runId: 'r',
                data: {},
            }).success
        ).toBe(false)
    })
})
