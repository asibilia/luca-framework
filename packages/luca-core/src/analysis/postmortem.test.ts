import { describe, expect, test } from 'bun:test'

import { analyzeRun, renderPostmortemMarkdown } from './postmortem.ts'
import type { AnalyzeRunInput } from './postmortem.ts'

import type { ConfidenceEntry } from '../confidence/index.ts'
import type { LedgerEntry } from '../ledger/index.ts'
import type { VerificationResult } from '../verification/index.ts'

const RUN = 'run_pm'

function ev(
    event: string,
    data: Record<string, unknown> = {},
    ts = '2026-05-22T10:00:00.000Z'
): LedgerEntry {
    return { timestamp: ts, runId: RUN, event, data }
}

function conf(confidence: ConfidenceEntry['confidence']): ConfidenceEntry {
    return {
        timestamp: '2026-05-22T10:00:00.000Z',
        phase: 'Phase One',
        wave: 1,
        task: 't',
        confidence,
        category: 'plan-gap',
        decision: 'd',
        alternatives: [],
        reasoning: 'r',
        risk: 'x',
        files: [],
    }
}

function run(over: Partial<AnalyzeRunInput> = {}) {
    return analyzeRun({
        runId: RUN,
        entries: [],
        verifications: [],
        confidence: [],
        ...over,
    })
}

describe('analyzeRun — violation detection', () => {
    test('flags an empty completed phase with no justification (critical)', () => {
        const report = run({
            entries: [
                ev('phase-start', { phase: 'P1' }, '2026-05-22T10:00:00.000Z'),
                ev(
                    'phase-diff-summary',
                    {
                        phase: 'P1',
                        isEmpty: true,
                        filesChanged: [],
                        commitsAdded: [],
                    },
                    '2026-05-22T10:01:00.000Z'
                ),
                ev(
                    'phase-complete',
                    { phase: 'P1' },
                    '2026-05-22T10:02:00.000Z'
                ),
            ],
        })
        const v = report.violations.find(
            (x) => x.code === 'EMPTY_PHASE_NO_JUSTIFICATION'
        )
        expect(v?.severity).toBe('critical')
    })

    test('an empty phase WITH a justification is not flagged', () => {
        const report = run({
            entries: [
                ev('phase-start', { phase: 'P1' }, '2026-05-22T10:00:00.000Z'),
                ev(
                    'phase-diff-summary',
                    { phase: 'P1', isEmpty: true },
                    '2026-05-22T10:01:00.000Z'
                ),
                ev(
                    'phase-empty-justification',
                    { phase: 'P1', category: 'docs', reasoning: 'doc-only' },
                    '2026-05-22T10:01:30.000Z'
                ),
                ev(
                    'phase-complete',
                    { phase: 'P1' },
                    '2026-05-22T10:02:00.000Z'
                ),
            ],
        })
        expect(
            report.violations.some(
                (x) => x.code === 'EMPTY_PHASE_NO_JUSTIFICATION'
            )
        ).toBe(false)
    })

    test('flags a todo moved to done without a verificationRef (critical)', () => {
        const report = run({
            entries: [
                ev('phase-start', { phase: 'P1' }, '2026-05-22T10:00:00.000Z'),
                ev(
                    'todo-moved-to-done',
                    { slug: 'do-x', verificationRef: null },
                    '2026-05-22T10:01:00.000Z'
                ),
            ],
        })
        const v = report.violations.find(
            (x) => x.code === 'TODO_DONE_NO_VERIFICATION'
        )
        expect(v?.severity).toBe('critical')
    })

    test('flags a blocked todo move as a warning', () => {
        const report = run({
            entries: [
                ev('todo-move-blocked', {
                    identifier: 'do-y',
                    reason: 'no ref',
                }),
            ],
        })
        const v = report.violations.find(
            (x) => x.code === 'TODO_DONE_NO_VERIFICATION'
        )
        expect(v?.severity).toBe('warning')
    })

    test('flags a forced transition as a warning', () => {
        const report = run({
            entries: [
                ev('pipeline-forced-transition', {
                    from: 'execute',
                    to: 'review',
                }),
            ],
        })
        expect(
            report.violations.some((x) => x.code === 'FORCED_TRANSITION')
        ).toBe(true)
    })

    test('flags a low-confidence threshold breach (>= 3 low entries)', () => {
        const report = run({
            confidence: [conf('low'), conf('low'), conf('low'), conf('high')],
        })
        const v = report.violations.find(
            (x) => x.code === 'LOW_CONFIDENCE_THRESHOLD'
        )
        expect(v?.severity).toBe('warning')
        expect(report.metrics.lowConfidenceCount).toBe(3)
    })

    test('does not flag fewer than 3 low-confidence entries', () => {
        const report = run({ confidence: [conf('low'), conf('low')] })
        expect(
            report.violations.some((x) => x.code === 'LOW_CONFIDENCE_THRESHOLD')
        ).toBe(false)
    })

    test('flags wave-advance-blocked, re-entry, and idle-bypass as warnings', () => {
        const report = run({
            entries: [
                ev('wave-advance-blocked', { phase: 'P1', wave: 2 }),
                ev('pipeline-re-entered', {
                    targetMode: 'execute',
                    reason: 'rework',
                }),
                ev('pipeline-guard-idle-bypass', {}),
            ],
        })
        const codes = report.violations.map((x) => x.code)
        expect(codes).toContain('WAVE_NO_VERIFICATION')
        expect(codes).toContain('PIPELINE_RE_ENTERED')
        expect(codes).toContain('PIPELINE_GUARD_IDLE_BYPASS')
    })

    test('a clean run has no violations', () => {
        const report = run({
            entries: [
                ev('phase-start', { phase: 'P1' }),
                ev('phase-complete', { phase: 'P1' }),
            ],
        })
        expect(report.violations).toEqual([])
    })
})

describe('analyzeRun — metrics, phases, pitfalls', () => {
    test('computes event metrics and run duration', () => {
        const report = run({
            entries: [
                ev('mode-transition', {}, '2026-05-22T10:00:00.000Z'),
                ev(
                    'phase-complete',
                    { phase: 'P1' },
                    '2026-05-22T10:05:00.000Z'
                ),
            ],
        })
        expect(report.metrics.totalEvents).toBe(2)
        expect(report.metrics.modeTransitions).toBe(1)
        expect(report.metrics.phasesCompleted).toBe(1)
        expect(report.durationMs).toBe(300_000)
    })

    test('attaches verification results to their phase', () => {
        const verification: VerificationResult = {
            timestamp: '2026-05-22T10:00:00.000Z',
            phase: 'P1',
            wave: 1,
            mode: 'full',
            status: 'PASS',
            criteria: [],
            checks: [],
            convergence: 'resolved',
            errorFingerprints: [],
            recommendation: 'proceed',
        }
        const report = run({
            entries: [ev('phase-start', { phase: 'P1' })],
            verifications: [verification],
        })
        expect(report.phases[0]?.verifications[0]?.status).toBe('PASS')
    })

    test('emits default-vault pitfall payloads for critical violations', () => {
        const report = run({
            entries: [
                ev('phase-start', { phase: 'P1' }, '2026-05-22T10:00:00.000Z'),
                ev(
                    'phase-diff-summary',
                    { phase: 'P1', isEmpty: true },
                    '2026-05-22T10:01:00.000Z'
                ),
                ev(
                    'phase-complete',
                    { phase: 'P1' },
                    '2026-05-22T10:02:00.000Z'
                ),
            ],
        })
        expect(report.pitfalls.length).toBe(1)
        expect(report.pitfalls[0]?.vault).toBe('default')
        expect(report.pitfalls[0]?.concept).toBe(
            'pitfall:empty-phase-no-justification'
        )
        expect(report.pitfalls[0]?.op_id).toContain(RUN)
    })
})

describe('renderPostmortemMarkdown', () => {
    test('renders run id, violation counts and a clean verdict', () => {
        const md = renderPostmortemMarkdown(run())
        expect(md).toContain(`# Postmortem — Run ${RUN}`)
        expect(md).toContain('No violations detected')
    })

    test('renders a critical-violation warning', () => {
        const md = renderPostmortemMarkdown(
            run({
                entries: [
                    ev(
                        'phase-start',
                        { phase: 'P1' },
                        '2026-05-22T10:00:00.000Z'
                    ),
                    ev(
                        'phase-diff-summary',
                        { phase: 'P1', isEmpty: true },
                        '2026-05-22T10:01:00.000Z'
                    ),
                    ev(
                        'phase-complete',
                        { phase: 'P1' },
                        '2026-05-22T10:02:00.000Z'
                    ),
                ],
            })
        )
        expect(md).toContain('Critical violations present')
        expect(md).toContain('EMPTY_PHASE_NO_JUSTIFICATION')
    })
})
