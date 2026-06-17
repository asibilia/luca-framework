import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { RoadmapPhase } from '../state/index.ts'
import type { VerificationResult } from '../verification/index.ts'

import { computeOutcomeKpis } from './outcome-kpi.ts'
import type { TelemetryRecord } from './schemas.ts'

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const tmpDirs: string[] = []

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-outcome-kpi-'))
    tmpDirs.push(dir)
    return dir
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

/** Write a phase confidence.jsonl with the given per-level entry counts. */
function writeConfidence(
    cwd: string,
    slug: string,
    counts: { high: number; medium: number; low: number }
): void {
    const dir = join(cwd, '.luca', 'phases', slug)
    mkdirSync(dir, { recursive: true })
    const lines: string[] = []
    const push = (confidence: 'high' | 'medium' | 'low') =>
        lines.push(
            JSON.stringify({
                timestamp: new Date().toISOString(),
                phase: slug,
                wave: 1,
                task: 'task-1',
                confidence,
                category: 'design-choice',
                decision: 'x',
                alternatives: [],
                reasoning: 'y',
                risk: 'z',
                files: [],
            })
        )
    for (let i = 0; i < counts.high; i++) push('high')
    for (let i = 0; i < counts.medium; i++) push('medium')
    for (let i = 0; i < counts.low; i++) push('low')
    writeFileSync(join(dir, 'confidence.jsonl'), `${lines.join('\n')}\n`)
}

/** Write a phase verify.json with the given wave + status. */
function writeVerify(
    cwd: string,
    slug: string,
    wave: number,
    status: VerificationResult['status']
): void {
    const dir = join(cwd, '.luca', 'phases', slug)
    mkdirSync(dir, { recursive: true })
    const result: VerificationResult = {
        timestamp: new Date().toISOString(),
        wave,
        mode: 'full',
        status,
        criteria: [],
        checks: [],
        convergence: status === 'PASS' ? 'resolved' : 'stalled',
        errorFingerprints: [],
        recommendation: status === 'PASS' ? 'proceed' : 'fix',
    }
    writeFileSync(join(dir, 'verify.json'), `${JSON.stringify(result, null, 2)}\n`)
}

/** Append a telemetry JSONL file (one record per line) under .luca/telemetry/. */
function writeTelemetry(
    cwd: string,
    runId: string,
    records: TelemetryRecord[]
): void {
    const dir = join(cwd, '.luca', 'telemetry')
    mkdirSync(dir, { recursive: true })
    const lines = records.map((r) => JSON.stringify(r)).join('\n')
    writeFileSync(join(dir, `${runId}.jsonl`), `${lines}\n`)
}

/** Build a signal.satisfaction source:outcome record. */
function outcomeRecord(opts: {
    slug: string | null
    complexity: string | null
    valence: 'positive' | 'negative' | 'neutral'
    step?: string
}): TelemetryRecord {
    return {
        v: 1,
        ts: new Date().toISOString(),
        runId: 'run_test',
        kind: 'signal.satisfaction',
        phase: null,
        slug: opts.slug,
        wave: null,
        complexity: opts.complexity,
        oversight: 'full-auto',
        durationMs: null,
        meta: {
            source: 'outcome',
            valence: opts.valence,
            ...(opts.step ? { step: opts.step } : {}),
        },
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeOutcomeKpis', () => {
    let cwd: string

    const roadmap: RoadmapPhase[] = [
        { name: 'foo', deps: [], status: 'complete', complexity: 'SIMPLE' },
        { name: 'bar', deps: [], status: 'complete', complexity: 'MODERATE' },
        { name: 'baz', deps: [], status: 'complete', complexity: 'MODERATE' },
    ]

    beforeEach(() => {
        cwd = cleanDir()

        // SIMPLE bucket: one phase `01-foo`.
        //   confidence: 1 low of 4 total → lowConfidenceRatio 0.25
        //   verify: lowest-wave PASS → first-pass
        //   outcome: 2 negative rework records (checks, verify) → reEntry, rework 2
        writeConfidence(cwd, '01-foo', { high: 2, medium: 1, low: 1 })
        writeVerify(cwd, '01-foo', 1, 'PASS')

        // MODERATE bucket: two phases `02-bar`, `03-baz`.
        //   02-bar: confidence 2 low of 4; verify lowest-wave STALLED (not first-pass);
        //           1 negative rework record (verify) → reEntry, rework 1
        //   03-baz: confidence 0 low of 2; verify PASS (first-pass);
        //           no negative outcome → no reEntry, rework 0
        writeConfidence(cwd, '02-bar', { high: 1, medium: 1, low: 2 })
        writeVerify(cwd, '02-bar', 2, 'STALLED')
        writeConfidence(cwd, '03-baz', { high: 1, medium: 1, low: 0 })
        writeVerify(cwd, '03-baz', 1, 'PASS')

        // Telemetry: real run records.
        writeTelemetry(cwd, 'run_test', [
            // 01-foo (SIMPLE): 2 negative rework records.
            outcomeRecord({
                slug: '01-foo',
                complexity: 'SIMPLE',
                valence: 'negative',
                step: 'checks',
            }),
            outcomeRecord({
                slug: '01-foo',
                complexity: 'SIMPLE',
                valence: 'negative',
                step: 'verify',
            }),
            // 02-bar (MODERATE): 1 negative rework record at verify.
            outcomeRecord({
                slug: '02-bar',
                complexity: 'MODERATE',
                valence: 'negative',
                step: 'verify',
            }),
            // 03-baz (MODERATE): a positive outcome (no rework, no re-entry).
            outcomeRecord({
                slug: '03-baz',
                complexity: 'MODERATE',
                valence: 'positive',
                step: 'verify',
            }),
            // slug:null record → unattributed, no bucket contribution.
            outcomeRecord({
                slug: null,
                complexity: null,
                valence: 'negative',
                step: 'verify',
            }),
        ])

        // Synthetic pr-outcomes.jsonl — MUST be excluded from all buckets.
        // A planted negative outcome for 01-foo would inflate rework if read.
        writeTelemetry(cwd, 'pr-outcomes', [
            outcomeRecord({
                slug: '01-foo',
                complexity: 'SIMPLE',
                valence: 'negative',
                step: 'checks',
            }),
        ])
    })

    test('lowConfidenceRatio == low / total per bucket (ac-01)', () => {
        const { buckets } = computeOutcomeKpis({ cwd, roadmap })
        // SIMPLE: 1 low / 4 total
        expect(buckets.SIMPLE?.lowConfidenceRatio).toBeCloseTo(0.25, 10)
        // MODERATE: (2 + 0) low / (4 + 2) total
        expect(buckets.MODERATE?.lowConfidenceRatio).toBeCloseTo(2 / 6, 10)
    })

    test('firstPassVerifyRate from lowest-wave PASS (ac-02)', () => {
        const { buckets } = computeOutcomeKpis({ cwd, roadmap })
        // SIMPLE: 01-foo PASS → 1/1
        expect(buckets.SIMPLE?.firstPassVerifyRate).toBeCloseTo(1, 10)
        // MODERATE: 02-bar STALLED (not first-pass), 03-baz PASS → 1/2
        expect(buckets.MODERATE?.firstPassVerifyRate).toBeCloseTo(0.5, 10)
    })

    test('NN-foo maps to its SIMPLE roadmap bucket (ac-03)', () => {
        const { buckets } = computeOutcomeKpis({ cwd, roadmap })
        expect(buckets.SIMPLE).toBeDefined()
        expect(buckets.SIMPLE?.sampleSize).toBe(1)
        // 01-foo's KPIs landed in SIMPLE, not MODERATE.
        expect(buckets.MODERATE?.sampleSize).toBe(2)
    })

    test('meanReworkIterations per bucket (ac-11)', () => {
        const { buckets } = computeOutcomeKpis({ cwd, roadmap })
        // SIMPLE: 01-foo has 2 negative rework records → mean 2
        expect(buckets.SIMPLE?.meanReworkIterations).toBeCloseTo(2, 10)
        // MODERATE: 02-bar 1, 03-baz 0 → mean 0.5
        expect(buckets.MODERATE?.meanReworkIterations).toBeCloseTo(0.5, 10)
    })

    test('reEntryRate per bucket (ac-12.1)', () => {
        const { buckets } = computeOutcomeKpis({ cwd, roadmap })
        // SIMPLE: 01-foo has ≥1 negative → 1/1
        expect(buckets.SIMPLE?.reEntryRate).toBeCloseTo(1, 10)
        // MODERATE: 02-bar negative, 03-baz none → 1/2
        expect(buckets.MODERATE?.reEntryRate).toBeCloseTo(0.5, 10)
    })

    test('slug:null record increments unattributed, contributes to no bucket (ac-12.2)', () => {
        const { buckets, unattributed } = computeOutcomeKpis({ cwd, roadmap })
        expect(unattributed.records).toBe(1)
        // The null record's negative valence did not inflate any bucket rework.
        expect(buckets.MODERATE?.meanReworkIterations).toBeCloseTo(0.5, 10)
    })

    test('pr-outcomes.jsonl is excluded from all buckets (ac-13)', () => {
        const { buckets } = computeOutcomeKpis({ cwd, roadmap })
        // If pr-outcomes were read, SIMPLE rework would be 3, not 2.
        expect(buckets.SIMPLE?.meanReworkIterations).toBeCloseTo(2, 10)
    })

    test('a phase with no roadmap match is tallied as unattributed', () => {
        // Add an orphan phase dir with no roadmap entry.
        writeConfidence(cwd, '09-orphan', { high: 0, medium: 0, low: 1 })
        writeVerify(cwd, '09-orphan', 1, 'PASS')
        const { unattributed } = computeOutcomeKpis({ cwd, roadmap })
        expect(unattributed.phases).toBe(1)
    })

    test('prose/uppercase roadmap name still attributes to its bucket (BUG-01)', () => {
        // Isolated fixture: roadmap name is PROSE with spaces + uppercase,
        // while the phase dir slug is kebab. Pre-fix, the raw-name map key
        // ("Implement OAuth") never matched the kebab lookup
        // ("implement-oauth") and the phase fell through to `unattributed`.
        const freshCwd = cleanDir()
        const proseRoadmap: RoadmapPhase[] = [
            {
                name: 'Implement OAuth',
                deps: [],
                status: 'complete',
                complexity: 'COMPLEX',
            },
        ]
        writeConfidence(freshCwd, '05-implement-oauth', {
            high: 1,
            medium: 0,
            low: 1,
        })
        writeVerify(freshCwd, '05-implement-oauth', 1, 'PASS')

        const { buckets, unattributed } = computeOutcomeKpis({
            cwd: freshCwd,
            roadmap: proseRoadmap,
        })

        // Lands in COMPLEX, NOT unattributed.
        expect(buckets.COMPLEX?.sampleSize).toBe(1)
        expect(unattributed.phases).toBe(0)
        expect(buckets.COMPLEX?.lowConfidenceRatio).toBeCloseTo(0.5, 10)
    })
})
