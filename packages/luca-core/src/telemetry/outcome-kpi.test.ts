import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { computeOutcomeKpis } from './outcome-kpi.ts'

import type { RoadmapPhase } from '../state/index.ts'
import type { VerificationResult } from '../verification/index.ts'

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
    writeFileSync(
        join(dir, 'verify.json'),
        `${JSON.stringify(result, null, 2)}\n`
    )
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
        writeConfidence(cwd, '01-foo', { high: 2, medium: 1, low: 1 })
        writeVerify(cwd, '01-foo', 1, 'PASS')

        // MODERATE bucket: two phases `02-bar`, `03-baz`.
        //   02-bar: confidence 2 low of 4; verify lowest-wave STALLED (not first-pass)
        //   03-baz: confidence 0 low of 2; verify PASS (first-pass)
        writeConfidence(cwd, '02-bar', { high: 1, medium: 1, low: 2 })
        writeVerify(cwd, '02-bar', 2, 'STALLED')
        writeConfidence(cwd, '03-baz', { high: 1, medium: 1, low: 0 })
        writeVerify(cwd, '03-baz', 1, 'PASS')
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
