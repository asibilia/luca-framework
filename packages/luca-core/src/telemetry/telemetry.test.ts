import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import { TelemetryRecordSchema } from './schemas.ts'
import {
    appendTelemetry,
    buildTelemetryRecord,
    readTelemetry,
    type TelemetryContext,
} from './telemetry.ts'

const tmpDirs: string[] = []

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-telemetry-'))
    tmpDirs.push(dir)
    return dir
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

const emptyCtx: TelemetryContext = {
    runId: null,
    phase: null,
    slug: null,
    wave: null,
    complexity: null,
    oversight: null,
}

const fullCtx: TelemetryContext = {
    runId: 'run_abc_def',
    phase: 'Phase One',
    slug: '01-phase-one',
    wave: 2,
    complexity: 'MODERATE',
    oversight: 'full-auto',
}

describe('buildTelemetryRecord', () => {
    test('stamps v:1 and a round-trippable ISO timestamp', () => {
        const rec = buildTelemetryRecord('phase.start', emptyCtx)
        expect(rec.v).toBe(1)
        expect(rec.ts).toBe(new Date(rec.ts).toISOString())
    })

    test('pulls phase / slug / wave / complexity / oversight from context', () => {
        const rec = buildTelemetryRecord('wave.start', fullCtx)
        expect(rec.runId).toBe('run_abc_def')
        expect(rec.phase).toBe('Phase One')
        expect(rec.slug).toBe('01-phase-one')
        expect(rec.wave).toBe(2)
        expect(rec.complexity).toBe('MODERATE')
        expect(rec.oversight).toBe('full-auto')
    })

    test('defaults runId to "" and other state fields to null when absent', () => {
        const rec = buildTelemetryRecord('mode.start', emptyCtx)
        expect(rec.runId).toBe('')
        expect(rec.phase).toBeNull()
        expect(rec.wave).toBeNull()
        expect(rec.durationMs).toBeNull()
    })

    test('overrides take precedence over context', () => {
        const rec = buildTelemetryRecord(
            'wave.end',
            fullCtx,
            {},
            { wave: 1, durationMs: 1234 }
        )
        expect(rec.wave).toBe(1)
        expect(rec.durationMs).toBe(1234)
    })

    test('carries caller meta verbatim', () => {
        const rec = buildTelemetryRecord('recall.hit', emptyCtx, { hits: 3 })
        expect(rec.meta).toEqual({ hits: 3 })
    })

    test('produces a record that satisfies TelemetryRecordSchema', () => {
        const rec = buildTelemetryRecord(
            'phase.end',
            fullCtx,
            { x: 1 },
            { durationMs: 9 }
        )
        expect(TelemetryRecordSchema.safeParse(rec).success).toBe(true)
    })
})

describe('appendTelemetry', () => {
    test('writes a JSONL line to .luca/telemetry/<runId>.jsonl', () => {
        const cwd = cleanDir()
        appendTelemetry({ cwd, kind: 'phase.start', ctx: fullCtx })
        const recs = readTelemetry({ cwd, runId: 'run_abc_def' })
        expect(recs.length).toBe(1)
        expect(recs[0]?.kind).toBe('phase.start')
    })

    test('appends multiple records in order', () => {
        const cwd = cleanDir()
        appendTelemetry({ cwd, kind: 'phase.start', ctx: fullCtx })
        appendTelemetry({ cwd, kind: 'wave.start', ctx: fullCtx })
        appendTelemetry({
            cwd,
            kind: 'phase.end',
            ctx: fullCtx,
            overrides: { durationMs: 5 },
        })
        const recs = readTelemetry({ cwd, runId: 'run_abc_def' })
        expect(recs.map((r) => r.kind)).toEqual([
            'phase.start',
            'wave.start',
            'phase.end',
        ])
    })

    test('skips silently when runId is empty (pre-triage)', () => {
        const cwd = cleanDir()
        expect(() =>
            appendTelemetry({ cwd, kind: 'mode.start', ctx: emptyCtx })
        ).not.toThrow()
        expect(readTelemetry({ cwd, runId: 'run_abc_def' })).toEqual([])
    })

    test('drops + warns on an invalid runId, never throws', () => {
        const cwd = cleanDir()
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        expect(() =>
            appendTelemetry({
                cwd,
                kind: 'phase.start',
                ctx: { ...emptyCtx, runId: '../../etc/evil' },
            })
        ).not.toThrow()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    test('never throws when the telemetry directory cannot be created', () => {
        const cwd = cleanDir()
        // Plant a FILE at .luca so mkdir of .luca/telemetry fails (ENOTDIR).
        writeFileSync(join(cwd, '.luca'), 'not a directory')
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        expect(() =>
            appendTelemetry({ cwd, kind: 'phase.start', ctx: fullCtx })
        ).not.toThrow()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})

describe('readTelemetry', () => {
    test('returns [] when the file does not exist', () => {
        expect(readTelemetry({ cwd: cleanDir(), runId: 'run_abc_def' })).toEqual(
            []
        )
    })

    test('returns [] for an invalid runId', () => {
        expect(readTelemetry({ cwd: cleanDir(), runId: '../evil' })).toEqual([])
    })

    test('skips malformed lines and keeps valid ones', () => {
        const cwd = cleanDir()
        const dir = join(cwd, '.luca', 'telemetry')
        mkdirSync(dir, { recursive: true })
        const good = JSON.stringify(
            buildTelemetryRecord('phase.start', fullCtx)
        )
        writeFileSync(
            join(dir, 'run_abc_def.jsonl'),
            `${good}\nnot json\n{"v":2}\n`
        )
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        const recs = readTelemetry({ cwd, runId: 'run_abc_def' })
        expect(recs.length).toBe(1)
        expect(recs[0]?.kind).toBe('phase.start')
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})

describe('TelemetryRecordSchema', () => {
    test('rejects a record whose v is not the literal 1', () => {
        const rec = { ...buildTelemetryRecord('phase.start', fullCtx), v: 2 }
        expect(TelemetryRecordSchema.safeParse(rec).success).toBe(false)
    })
})
