import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { VerificationResultSchema, type VerificationResult } from './schemas.ts'
import {
    aggregateVerificationResults,
    findCriterion,
    readVerificationResult,
    writeVerificationResult,
} from './verification-result.ts'

const tmpDirs: string[] = []
const SLUG = '01-phase-one'

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-verify-'))
    tmpDirs.push(dir)
    return dir
}

function sampleResult(
    overrides: Partial<VerificationResult> = {}
): VerificationResult {
    return {
        timestamp: '2026-05-22T10:00:00.000Z',
        wave: 1,
        mode: 'full',
        status: 'PASS',
        criteria: [
            {
                criterionId: 'ac-01',
                description: 'builds clean',
                met: true,
                evidence: 'tsc clean',
                blocking: true,
            },
        ],
        checks: [
            {
                name: 'tsc',
                status: 'pass',
                errorCount: 0,
                warningCount: 0,
            },
        ],
        convergence: 'resolved',
        errorFingerprints: [],
        recommendation: 'proceed',
        ...overrides,
    }
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('writeVerificationResult + readVerificationResult', () => {
    test('round-trips through .luca/phases/<slug>/verify.json', () => {
        const cwd = cleanDir()
        writeVerificationResult({ cwd, slug: SLUG, result: sampleResult() })
        const p = join(cwd, '.luca', 'phases', SLUG, 'verify.json')
        expect(JSON.parse(readFileSync(p, 'utf-8')).status).toBe('PASS')
        expect(readVerificationResult({ cwd, slug: SLUG })?.status).toBe('PASS')
    })

    test('stamps the supplied runId when the result has none', () => {
        const cwd = cleanDir()
        writeVerificationResult({
            cwd,
            slug: SLUG,
            result: sampleResult(),
            runId: 'run_stamp',
        })
        expect(readVerificationResult({ cwd, slug: SLUG })?.runId).toBe(
            'run_stamp'
        )
    })

    test('keeps an existing result.runId over the supplied runId', () => {
        const cwd = cleanDir()
        writeVerificationResult({
            cwd,
            slug: SLUG,
            result: sampleResult({ runId: 'run_original' }),
            runId: 'run_stamp',
        })
        expect(readVerificationResult({ cwd, slug: SLUG })?.runId).toBe(
            'run_original'
        )
    })

    test('returns null when no result file exists', () => {
        expect(
            readVerificationResult({ cwd: cleanDir(), slug: SLUG })
        ).toBeNull()
    })

    test('returns null for a stale result (runId mismatch)', () => {
        const cwd = cleanDir()
        writeVerificationResult({
            cwd,
            slug: SLUG,
            result: sampleResult({ runId: 'run_old' }),
        })
        expect(
            readVerificationResult({ cwd, slug: SLUG, currentRunId: 'run_new' })
        ).toBeNull()
        expect(
            readVerificationResult({ cwd, slug: SLUG, currentRunId: 'run_old' })
                ?.status
        ).toBe('PASS')
    })

    test('accepts a legacy result without a runId even when one is current', () => {
        const cwd = cleanDir()
        writeVerificationResult({ cwd, slug: SLUG, result: sampleResult() })
        expect(
            readVerificationResult({ cwd, slug: SLUG, currentRunId: 'run_x' })
                ?.status
        ).toBe('PASS')
    })

    test('returns null for a malformed or schema-invalid file', () => {
        const cwd = cleanDir()
        const dir = join(cwd, '.luca', 'phases', SLUG)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, 'verify.json'), 'not json')
        expect(readVerificationResult({ cwd, slug: SLUG })).toBeNull()
        writeFileSync(join(dir, 'verify.json'), '{"status":"BOGUS"}')
        expect(readVerificationResult({ cwd, slug: SLUG })).toBeNull()
    })
})

describe('findCriterion', () => {
    test('finds a criterion by id', () => {
        const found = findCriterion({
            results: [sampleResult()],
            criterionId: 'ac-01',
        })
        expect(found?.criterion.description).toBe('builds clean')
    })

    test('returns null for an unknown criterion id', () => {
        expect(
            findCriterion({ results: [sampleResult()], criterionId: 'ac-99' })
        ).toBeNull()
    })

    test('newest matching result wins', () => {
        const older = sampleResult({
            criteria: [
                {
                    criterionId: 'ac-01',
                    description: 'old',
                    met: false,
                    evidence: '',
                    blocking: true,
                },
            ],
        })
        const newer = sampleResult({
            criteria: [
                {
                    criterionId: 'ac-01',
                    description: 'new',
                    met: true,
                    evidence: 'ok',
                    blocking: true,
                },
            ],
        })
        const found = findCriterion({
            results: [older, newer],
            criterionId: 'ac-01',
        })
        expect(found?.criterion.met).toBe(true)
    })

    test('respects the optional wave filter', () => {
        const w1 = sampleResult({ wave: 1 })
        const w2 = sampleResult({
            wave: 2,
            criteria: [
                {
                    criterionId: 'ac-01',
                    description: 'wave two',
                    met: true,
                    evidence: 'ok',
                    blocking: true,
                },
            ],
        })
        const found = findCriterion({
            results: [w1, w2],
            criterionId: 'ac-01',
            wave: 1,
        })
        expect(found?.criterion.description).toBe('builds clean')
    })
})

describe('aggregateVerificationResults', () => {
    test('counts waves by verdict', () => {
        const agg = aggregateVerificationResults([
            sampleResult({ status: 'FAIL', wave: 1 }),
            sampleResult({ status: 'PASS', wave: 2 }),
        ])
        expect(agg.totalWaves).toBe(2)
        expect(agg.passCount).toBe(1)
        expect(agg.failCount).toBe(1)
        expect(agg.stalledCount).toBe(0)
        expect(agg.allCriteriaMet).toBe(true)
    })

    test('extracts blocking gaps from the latest result', () => {
        const failing = sampleResult({
            status: 'FAIL',
            criteria: [
                {
                    criterionId: 'ac-02',
                    description: 'tests pass',
                    met: false,
                    evidence: '',
                    gap: 'missing tests',
                    blocking: true,
                },
            ],
        })
        const agg = aggregateVerificationResults([failing])
        expect(agg.blockingGaps).toEqual([
            { criterionId: 'ac-02', gap: 'missing tests', wave: 1 },
        ])
        expect(agg.allCriteriaMet).toBe(false)
    })

    test('reports an empty aggregate for no results', () => {
        const agg = aggregateVerificationResults([])
        expect(agg.totalWaves).toBe(0)
        expect(agg.allCriteriaMet).toBe(false)
        expect(agg.blockingGaps).toEqual([])
    })
})

describe('VerificationResultSchema', () => {
    test('rejects an unknown status verdict', () => {
        expect(
            VerificationResultSchema.safeParse(
                sampleResult({ status: 'MAYBE' as never })
            ).success
        ).toBe(false)
    })
})
