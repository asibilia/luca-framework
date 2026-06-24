import { describe, expect, test } from 'bun:test'

import {
    detectRecurringPitfalls,
    renderDraftRule,
    renderSuggestedRulesMarkdown,
} from './recurrence.ts'

import { analyzeRun } from '../analysis/postmortem.ts'
import type { PostmortemReport } from '../analysis/postmortem.ts'

/** Build a real PostmortemReport for a run from a list of ledger event names. */
function reportWith(runId: string, events: string[]): PostmortemReport {
    return analyzeRun({
        runId,
        entries: events.map((event, i) => ({
            timestamp: `2026-05-22T10:0${i}:00.000Z`,
            runId,
            event,
            data: {},
        })),
        verifications: [],
        confidence: [],
    })
}

describe('detectRecurringPitfalls', () => {
    test('flags a code that recurs across >= threshold distinct runs', () => {
        const result = detectRecurringPitfalls({
            reports: [
                reportWith('run_1', ['pipeline-forced-transition']),
                reportWith('run_2', ['pipeline-forced-transition']),
                reportWith('run_3', ['pipeline-forced-transition']),
            ],
        })
        expect(result.runsScanned).toBe(3)
        const forced = result.recurring.find(
            (r) => r.code === 'FORCED_TRANSITION'
        )
        expect(forced?.runCount).toBe(3)
        expect(forced?.suggestedRuleId).toBe('recurring/forced-transition')
        expect(forced?.pitfallConcept).toBe('pitfall:forced-transition')
    })

    test('does not flag a code below threshold', () => {
        const result = detectRecurringPitfalls({
            reports: [
                reportWith('run_1', ['pipeline-forced-transition']),
                reportWith('run_2', ['pipeline-forced-transition']),
            ],
        })
        expect(result.recurring).toEqual([])
    })

    test('honors a custom threshold', () => {
        const result = detectRecurringPitfalls({
            reports: [
                reportWith('run_1', ['pipeline-re-entered']),
                reportWith('run_2', ['pipeline-re-entered']),
            ],
            threshold: 2,
        })
        expect(
            result.recurring.some((r) => r.code === 'PIPELINE_RE_ENTERED')
        ).toBe(true)
    })

    test('counts distinct runs, not total occurrences', () => {
        const result = detectRecurringPitfalls({
            reports: [
                reportWith('run_1', [
                    'pipeline-forced-transition',
                    'pipeline-forced-transition',
                ]),
                reportWith('run_2', ['pipeline-forced-transition']),
            ],
            threshold: 2,
        })
        const forced = result.recurring.find(
            (r) => r.code === 'FORCED_TRANSITION'
        )
        expect(forced?.runCount).toBe(2)
        expect(forced?.occurrences).toBe(3)
    })

    test('sorts recurring pitfalls by run count descending', () => {
        const result = detectRecurringPitfalls({
            reports: [
                reportWith('r1', [
                    'pipeline-forced-transition',
                    'pipeline-re-entered',
                ]),
                reportWith('r2', [
                    'pipeline-forced-transition',
                    'pipeline-re-entered',
                ]),
                reportWith('r3', ['pipeline-forced-transition']),
            ],
            threshold: 2,
        })
        expect(result.recurring[0]?.code).toBe('FORCED_TRANSITION')
        expect(result.recurring[1]?.code).toBe('PIPELINE_RE_ENTERED')
    })
})

describe('renderDraftRule', () => {
    test('renders importable TypeScript with the suggested rule id', () => {
        const pitfall = detectRecurringPitfalls({
            reports: [
                reportWith('run_1', ['pipeline-forced-transition']),
                reportWith('run_2', ['pipeline-forced-transition']),
                reportWith('run_3', ['pipeline-forced-transition']),
            ],
        }).recurring[0]
        expect(pitfall).toBeDefined()
        const draft = renderDraftRule(pitfall!)
        expect(draft).toContain("id: 'recurring/forced-transition'")
        expect(draft).toContain('export default')
        expect(draft).toContain('check:')
    })
})

describe('renderSuggestedRulesMarkdown', () => {
    test('renders an empty-state message when nothing recurs', () => {
        const md = renderSuggestedRulesMarkdown(
            detectRecurringPitfalls({ reports: [] })
        )
        expect(md).toContain('No recurring pitfalls')
    })

    test('renders a section per recurring pitfall', () => {
        const md = renderSuggestedRulesMarkdown(
            detectRecurringPitfalls({
                reports: [
                    reportWith('run_1', ['pipeline-forced-transition']),
                    reportWith('run_2', ['pipeline-forced-transition']),
                    reportWith('run_3', ['pipeline-forced-transition']),
                ],
            })
        )
        expect(md).toContain('# Suggested Rules')
        expect(md).toContain('FORCED_TRANSITION')
        expect(md).toContain('.luca/rules/forced-transition.ts')
    })
})
