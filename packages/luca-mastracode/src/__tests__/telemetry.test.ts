import {
    mkdtempSync,
    rmSync,
    existsSync,
    readFileSync,
    appendFileSync,
} from 'node:fs'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, test, expect, beforeEach, afterEach, spyOn } from 'bun:test'

import { writeLucaState } from '../state/luca-store.js'
import {
    appendTelemetry,
    buildTelemetryRecord,
    readTelemetry,
    TelemetryRecordSchema,
    type TelemetryRecord,
} from '../state/telemetry.js'
import {
    TELEMETRY_PATH,
    TELEMETRY_DIR,
    assertValidRunId,
} from '../util/phase-paths.js'

let tmpRoot: string
let originalCwd: string

beforeEach(() => {
    originalCwd = process.cwd()
    tmpRoot = mkdtempSync(join(tmpdir(), 'luca-telemetry-test-'))
    process.chdir(tmpRoot)
})

afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(tmpRoot)) {
        rmSync(tmpRoot, { recursive: true, force: true })
    }
})

// Seed minimum state for a record to be writable.
function seedState(runId = 'run_test_123') {
    writeLucaState({
        runId,
        currentPhaseName: 'Phase 1: Test',
        currentPhaseSlug: '20260512-test-slug',
        currentWave: 1,
        complexity: 'COMPLEX',
        oversight: 'full-auto',
    })
}

describe('telemetry — buildTelemetryRecord (pure)', () => {
    test('returns shape with v: 1 and current state fields', () => {
        seedState('run_test_abc')
        const rec = buildTelemetryRecord('phase.start')

        expect(rec.v).toBe(1)
        expect(rec.kind).toBe('phase.start')
        expect(rec.runId).toBe('run_test_abc')
        expect(rec.phase).toBe('Phase 1: Test')
        expect(rec.slug).toBe('20260512-test-slug')
        expect(rec.wave).toBe(1)
        expect(rec.complexity).toBe('COMPLEX')
        expect(rec.oversight).toBe('full-auto')
        expect(rec.durationMs).toBeNull()
        expect(rec.meta).toEqual({})
        expect(rec.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/) // ISO 8601
    })

    test('applies overrides, including durationMs', () => {
        seedState()
        const rec = buildTelemetryRecord(
            'wave.end',
            { iteration: 2 },
            {
                wave: 3,
                phase: 'Old Phase',
                slug: 'old-slug',
                durationMs: 42_000,
            }
        )

        expect(rec.wave).toBe(3)
        expect(rec.phase).toBe('Old Phase')
        expect(rec.slug).toBe('old-slug')
        expect(rec.durationMs).toBe(42_000)
        expect(rec.meta).toEqual({ iteration: 2 })
    })

    test('returns nulls for absent state fields', () => {
        // Pre-triage: no state at all. Buffer writeLucaState with bare minimum.
        writeLucaState({ runId: 'run_pre' })
        const rec = buildTelemetryRecord('phase.start')

        expect(rec.runId).toBe('run_pre')
        expect(rec.phase).toBeNull()
        expect(rec.slug).toBeNull()
        expect(rec.wave).toBeNull()
        expect(rec.complexity).toBeNull()
        expect(rec.oversight).toBeNull()
    })
})

describe('telemetry — appendTelemetry (writer)', () => {
    test('creates .planning/telemetry/<runId>.jsonl on first call', () => {
        seedState('run_test_xyz')
        appendTelemetry('phase.start')

        const p = TELEMETRY_PATH('run_test_xyz')
        expect(existsSync(p)).toBe(true)
        expect(existsSync(TELEMETRY_DIR())).toBe(true)
    })

    test('subsequent calls append (one JSON line per record, ending in \\n)', () => {
        seedState('run_test_append')
        appendTelemetry('phase.start')
        appendTelemetry('wave.start')
        appendTelemetry('wave.end', {}, { durationMs: 1234 })

        const content = readFileSync(TELEMETRY_PATH('run_test_append'), 'utf-8')
        expect(content.endsWith('\n')).toBe(true)
        const lines = content.trim().split('\n')
        expect(lines.length).toBe(3)
        // Each line is valid JSON
        const parsed = lines.map((l) => JSON.parse(l))
        expect(parsed[0].kind).toBe('phase.start')
        expect(parsed[1].kind).toBe('wave.start')
        expect(parsed[2].kind).toBe('wave.end')
        expect(parsed[2].durationMs).toBe(1234)
    })

    test('skips silently when runId is absent (pre-triage)', () => {
        // No seedState — state is empty.
        const warn = spyOn(console, 'warn').mockReturnValue(undefined)
        appendTelemetry('phase.start')
        // No file should have been written.
        expect(existsSync(TELEMETRY_DIR())).toBe(false)
        // Should NOT warn — this is an expected pre-triage no-op.
        expect(warn).not.toHaveBeenCalled()
        warn.mockRestore()
    })

    test('does NOT throw when appendFileSync throws (disk full / permission)', () => {
        seedState('run_test_fail')
        const warn = spyOn(console, 'warn').mockReturnValue(undefined)
        const appendSpy = spyOn(fs, 'appendFileSync').mockImplementation(() => {
            throw new Error('ENOSPC: no space left on device')
        })

        // Must not throw.
        expect(() => appendTelemetry('phase.start')).not.toThrow()
        expect(warn).toHaveBeenCalled()
        const callArg = warn.mock.calls[0]?.[0] ?? ''
        expect(callArg).toContain('[telemetry] write failed')

        appendSpy.mockRestore()
        warn.mockRestore()
    })
})

describe('telemetry — TelemetryRecordSchema validation', () => {
    test('drops malformed records with warn (mocked bad input)', () => {
        seedState('run_test_zod')
        const warn = spyOn(console, 'warn').mockReturnValue(undefined)
        // Force a bad record by passing a non-string runId via override.
        appendTelemetry(
            'phase.start',
            {},
            // @ts-expect-error — intentional bad input
            { runId: 42 }
        )
        expect(warn).toHaveBeenCalled()
        const callArg = warn.mock.calls[0]?.[0] ?? ''
        expect(callArg).toContain('[telemetry] dropped malformed record')
        // File should not exist (or be empty).
        const p = TELEMETRY_PATH('run_test_zod')
        if (existsSync(p)) {
            expect(readFileSync(p, 'utf-8').trim()).toBe('')
        }
        warn.mockRestore()
    })

    test('schema accepts the canonical shape', () => {
        const rec = {
            v: 1,
            ts: new Date().toISOString(),
            runId: 'run_test',
            kind: 'phase.start',
            phase: null,
            slug: null,
            wave: null,
            complexity: null,
            oversight: null,
            durationMs: null,
            meta: {},
        }
        const result = TelemetryRecordSchema.safeParse(rec)
        expect(result.success).toBe(true)
    })
})

describe('telemetry — readTelemetry', () => {
    test('returns [] for missing file (valid canonical runId, no file written)', () => {
        // run_missing_file matches /^run_[a-z0-9]+_[a-z0-9]+$/ so this
        // exercises the file-not-found path (existsSync false), not the
        // invalid-runId guard. See "returns [] for invalid runId" below
        // for the guard branch.
        expect(readTelemetry('run_missing_file')).toEqual([])
    })

    test('returns [] for invalid runId (does not throw)', () => {
        // Exercises the assertValidRunId try/catch in readTelemetry. Both
        // a traversal-shaped string and a multi-underscore non-canonical
        // form must return [] silently.
        expect(readTelemetry('../../etc/passwd')).toEqual([])
        expect(readTelemetry('run_three_underscored_id')).toEqual([])
    })

    test('parses records line-by-line', () => {
        seedState('run_test_read')
        appendTelemetry('phase.start')
        appendTelemetry('wave.start')
        const records = readTelemetry('run_test_read')
        expect(records.length).toBe(2)
        expect(records[0]!.kind).toBe('phase.start')
        expect(records[1]!.kind).toBe('wave.start')
    })

    test('skips malformed lines with warn', () => {
        seedState('run_test_mixed')
        appendTelemetry('phase.start')
        // Manually inject a bad line.
        const p = TELEMETRY_PATH('run_test_mixed')
        appendFileSync(p, 'not-json\n', 'utf-8')
        appendTelemetry('phase.end', {}, { durationMs: 100 })

        const warn = spyOn(console, 'warn').mockReturnValue(undefined)
        const records = readTelemetry('run_test_mixed')
        expect(records.length).toBe(2)
        expect(records[0]!.kind).toBe('phase.start')
        expect(records[1]!.kind).toBe('phase.end')
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    test('returns [] when readFileSync throws (TOCTOU / EACCES)', () => {
        // Regression: Copilot PR #239 review #3228846315. readTelemetry must
        // honor a no-throw read contract even if the file is unreadable or
        // disappears between existsSync and readFileSync.
        seedState('run_test_unreadable')
        appendTelemetry('phase.start') // ensure the file exists so existsSync passes
        const warn = spyOn(console, 'warn').mockReturnValue(undefined)
        const readSpy = spyOn(fs, 'readFileSync').mockImplementation(() => {
            throw new Error('EACCES: permission denied')
        })

        // Must not throw — must return [].
        let result: TelemetryRecord[] | undefined
        expect(() => {
            result = readTelemetry('run_test_unreadable')
        }).not.toThrow()
        expect(result).toEqual([])
        expect(warn).toHaveBeenCalled()
        const callArg = warn.mock.calls[0]?.[0] ?? ''
        expect(callArg).toContain('[telemetry] read failed')

        readSpy.mockRestore()
        warn.mockRestore()
    })
})

describe('phase-paths — assertValidRunId (strict canonical)', () => {
    // Path-shaped string inputs — one test per case for unambiguous failure
    // output. Grouped here via test.each for consistency with the
    // character-level rejection table below.
    test.each([
        ['../foo', 'traversal'],
        ['/abs', 'absolute path'],
        ['', 'empty string'],
    ])('rejects %p (%s)', (input) => {
        expect(() => assertValidRunId(input)).toThrow()
    })

    // Non-string inputs. test.each splits each value into its own reported
    // test, so a regression on (say) `null` does not get masked by an
    // earlier `42` failure.
    test.each([
        [42, 'number'],
        [null, 'null'],
        [undefined, 'undefined'],
    ])('rejects %p (%s)', (input) => {
        expect(() => assertValidRunId(input as any)).toThrow()
    })

    test('accepts canonical "run_<ts36>_<rand36>"', () => {
        expect(() => assertValidRunId('run_mox3w04j_ybsyiwgt')).not.toThrow()
        expect(() => assertValidRunId('run_abc_def')).not.toThrow()
    })

    // Character-level rejection cases (control chars, separators, length).
    test.each([
        ['run_a\\b', 'backslash in segment'],
        ['run_a\0b', 'null byte in segment'],
        ['run_' + 'a'.repeat(80), 'length > 64'],
    ])('rejects %p (%s)', (input) => {
        expect(() => assertValidRunId(input)).toThrow()
    })

    test('TELEMETRY_PATH throws for an invalid runId', () => {
        expect(() => TELEMETRY_PATH('../escape')).toThrow()
        expect(() => TELEMETRY_PATH('')).toThrow()
    })

    test('TELEMETRY_PATH returns a path inside telemetry/ for a canonical runId', () => {
        const p = TELEMETRY_PATH('run_test_xyz')
        expect(p.startsWith(TELEMETRY_DIR())).toBe(true)
        expect(p.endsWith('run_test_xyz.jsonl')).toBe(true)
    })

    test('error message is bounded for very long tampered runId values', () => {
        // Regression: Copilot PR #239 review #3229046575. A maliciously
        // large `runId` in luca-state.json must not produce a multi-MB
        // error string via JSON.stringify. assertValidRunId now routes
        // user-controlled strings through `displayRunId`, which truncates
        // to a bounded summary (`<head>…<tail> (len=N)`) for strings > 80.
        const huge = 'x'.repeat(10_000)
        let err: Error | undefined
        try {
            assertValidRunId(huge)
        } catch (e) {
            err = e as Error
        }
        expect(err).toBeDefined()
        // The error message must be bounded — well under the raw input
        // length. Cap at 500 chars as a generous ceiling that proves the
        // string is summarized, not echoed verbatim.
        expect(err!.message.length).toBeLessThan(500)
        // And must include the actual length so debuggers know they are
        // looking at a truncated representation.
        expect(err!.message).toContain('len=10000')
    })
})

describe('telemetry — invalid runId is dropped, not thrown', () => {
    test('appendTelemetry drops with warn when state.runId is invalid', () => {
        // Seed state with a tampered runId. appendTelemetry must not throw,
        // must not write any file, and must warn.
        writeLucaState({
            runId: '../../etc/passwd',
            currentPhaseName: 'Phase 1: Test',
            currentPhaseSlug: '20260512-test-slug',
            currentWave: 1,
            complexity: 'COMPLEX',
            oversight: 'full-auto',
        })
        const warn = spyOn(console, 'warn').mockReturnValue(undefined)

        expect(() => appendTelemetry('phase.start')).not.toThrow()
        expect(warn).toHaveBeenCalled()
        const callArg = warn.mock.calls[0]?.[0] ?? ''
        expect(callArg).toContain('invalid runId')

        // Nothing should have been written to telemetry/.
        expect(existsSync(TELEMETRY_DIR())).toBe(false)
        warn.mockRestore()
    })

    test('readTelemetry returns [] for an invalid runId', () => {
        expect(readTelemetry('../escape')).toEqual([])
        expect(readTelemetry('')).toEqual([])
    })
})
