/**
 * Regression guard for the luca-telemetry-report skill body.
 *
 * The skill was NARROWED when the local telemetry sink was narrowed: the
 * cost-analytics / PR-outcome / subagent-attribution directives were removed
 * along with the kinds that fed them, leaving MuninnDB recall quality — the
 * one signal LangSmith cannot observe.
 *
 * These blocks assert BOTH halves of that decision so a future edit cannot
 * silently drift either way:
 *   - the recall directives that MUST be present (the retained sink), and
 *   - the retired directives that MUST NOT come back (they have no producer).
 *
 * Each ask is asserted in a SEPARATELY-NAMED describe block so a partial drop
 * of any single directive fails that block independently. The BODY is obtained
 * via the real export (`lucaTelemetryReportSkill.body`), so the assertions run
 * against the rendered skill body the harness actually inlines.
 */
import { describe, it, expect, test } from 'bun:test'

import { lucaTelemetryReportSkill } from './index.ts'

const body = lucaTelemetryReportSkill.body

describe('recall-stats', () => {
    it('accumulates both recall outcome kinds', () => {
        expect(body).toContain('recall.hit')
        expect(body).toContain('recall.miss')
    })

    it('reads the hit-rate inputs from the record meta', () => {
        expect(body).toContain('meta.callerMode')
        expect(body).toContain('meta.resultCount')
        expect(body).toContain('meta.verifiedCount')
    })

    test('renders the Recall Stats section', () => {
        expect(body).toContain('### Recall Stats')
    })
})

describe('recall-utilization', () => {
    it('accumulates the recall.utilization kind', () => {
        expect(body).toContain('recall.utilization')
    })

    it('correlates recalled ids to outcome valence', () => {
        expect(body).toContain('meta.recalledIds')
        expect(body).toContain('meta.outcome')
    })

    test('renders the Recall Utilization section', () => {
        expect(body).toContain('### Recall Utilization')
    })
})

describe('retired-directives', () => {
    // Nothing emits these kinds any more — a report section for them would
    // render permanently empty and mislead the reader.
    for (const section of [
        '### Cost Summary',
        '### Cost per Outcome',
        '### Structure vs Executor Attribution',
        '### PR Outcomes',
        '### Subagent Costs',
        '### Step Durations',
        '### Review Convergence',
    ]) {
        test(`does not render "${section}"`, () => {
            expect(body).not.toContain(section)
        })
    }

    it('does not instruct aggregation of retired kinds', () => {
        expect(body).not.toContain('meta.inputTokens')
        expect(body).not.toContain('meta.role')
        expect(body).not.toContain('meta.correlationId')
        expect(body).not.toContain('meta.prNumber')
    })
})

describe('replacement-pointers', () => {
    it('routes spend and latency questions to LangSmith', () => {
        expect(body).toContain('LangSmith')
        expect(body).toContain('/trace-insights')
    })

    it('routes mode-transition questions to the ledger', () => {
        expect(body).toContain('.luca/ledger.jsonl')
    })
})
