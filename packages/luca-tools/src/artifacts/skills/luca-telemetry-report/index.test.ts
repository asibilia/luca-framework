/**
 * Regression guard for the cost-analytics directives in the
 * luca-telemetry-report skill body (phase 02-cost-per-outcome-report, Wave 1).
 *
 * Wave 1 added 3 cost-analytics directive sections to the skill BODY:
 *   - cost compute (Model rate table + per-call cost math)
 *   - Cost per Outcome (cost / phases-completed + cost / first-pass-success)
 *   - Structure vs Executor Attribution (meta.role bucketing)
 *
 * Each ask is asserted in a SEPARATELY-NAMED describe block so a partial drop
 * of any single directive fails that block independently (not an aggregate
 * "≥1 directive present" probe). The BODY is obtained via the real export
 * (`lucaTelemetryReportSkill.body`), so the assertions run against the
 * rendered skill body the harness actually inlines.
 */
import { describe, it, expect, test } from 'bun:test'

import { lucaTelemetryReportSkill } from './index.ts'

const body = lucaTelemetryReportSkill.body

describe('cost-compute', () => {
    it('substring-matches the three model tiers', () => {
        expect(body).toContain('opus')
        expect(body).toContain('sonnet')
        expect(body).toContain('haiku')
    })

    it('reads the token sources from the record meta', () => {
        expect(body).toContain('inputTokens')
        expect(body).toContain('outputTokens')
    })

    test('renders the Cost Summary section', () => {
        expect(body).toContain('### Cost Summary')
    })
})

describe('cost-per-outcome', () => {
    test('renders the Cost per Outcome section', () => {
        expect(body).toContain('### Cost per Outcome')
    })

    it('defines both cost-efficiency ratios', () => {
        expect(body).toContain('phases-completed')
        expect(body).toContain('first-pass')
    })
})

describe('structure-vs-executor', () => {
    it('buckets spend by the role attribution key', () => {
        expect(body).toContain('meta.role')
        expect(body).toContain('executor')
    })

    test('renders the Structure vs Executor Attribution section', () => {
        expect(body).toContain('### Structure vs Executor Attribution')
    })
})

describe('pr-outcomes', () => {
    it('accumulates the pr.outcome telemetry kind', () => {
        expect(body).toContain('pr.outcome')
    })

    test('renders the PR Outcomes section', () => {
        expect(body).toContain('### PR Outcomes')
    })

    it('reports the merge-rate and time-to-merge KPIs', () => {
        expect(body).toContain('merge rate')
        expect(body).toContain('time-to-merge')
    })

    it('teaches the pr.created run→PR join key', () => {
        expect(body).toContain('pr.created')
    })
})
