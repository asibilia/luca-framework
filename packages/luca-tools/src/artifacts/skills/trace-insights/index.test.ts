/**
 * Regression guard for the load-bearing directives in the trace-insights
 * skill body (P2: Stages A–E + Stage F MuninnDB persistence & analysis cursor).
 *
 * Each directive family is asserted in a SEPARATELY-NAMED describe block so
 * a partial drop of any single directive fails that block independently.
 * The BODY is obtained via the real export (`traceInsightsSkill.body`), so
 * the assertions run against the rendered skill body the harness inlines.
 */
import { describe, it, expect, test } from 'bun:test'

import { traceInsightsSkill } from './index.ts'

const body = traceInsightsSkill.body

describe('scope-guard', () => {
    it('bounds MuninnDB writes to the Stage F routing table', () => {
        expect(body).toContain('mcp__muninn__muninn_remember')
        expect(body).toContain('Stage F routing table')
        expect(body).not.toContain('MuninnDB persistence is P2')
    })

    it('keeps destructive MuninnDB tools forbidden', () => {
        expect(body).toContain('muninn_forget')
        expect(body).toContain('muninn_state')
        expect(body).toContain('muninn_consolidate')
    })

    it('forbids .luca/ writes and luca CLI mutations', () => {
        expect(body).toContain('Any `Write` under `.luca/`')
        expect(body).toContain('luca state advance')
    })

    it('declares the LangSmith API read-only', () => {
        expect(body).toContain('queried read-only')
    })
})

describe('secret-handling', () => {
    it('names the key env var and forbids echoing it', () => {
        expect(body).toContain('CC_LANGSMITH_API_KEY')
        expect(body).toContain('NEVER be echoed')
    })

    it('flags the lsv2_ key-fragment pattern', () => {
        expect(body).toContain('lsv2_')
    })
})

describe('privacy', () => {
    it('caps evidence quotes at 300 characters', () => {
        expect(body).toContain('300 char')
    })

    it('requires secret-scanning before issue inclusion', () => {
        expect(body).toContain('secret-scanned')
    })
})

describe('fetch-recipe', () => {
    it('resolves the project via the sessions endpoint', () => {
        expect(body).toContain('/api/v1/sessions')
        expect(body).toContain('CC_LANGSMITH_PROJECT')
    })

    it('pages root runs via runs/query with cursor pagination', () => {
        expect(body).toContain('/api/v1/runs/query')
        expect(body).toContain('cursors.next')
        expect(body).toContain('"is_root": true')
    })

    it('filters the window via the start_time filter DSL', () => {
        expect(body).toContain('gt(start_time')
    })
})

describe('deep-read-bounds', () => {
    it('caps deep reads and truncates payloads', () => {
        expect(body).toContain('--max-deep-reads')
        expect(body).toContain('2,000')
        expect(body).toContain('NEVER fetch or read full multi-million-token LLM payloads')
    })

    it('dedups the candidate pool by session', () => {
        expect(body).toContain('at most 2 traces per session')
    })

    it('logs dropped candidates (no silent caps)', () => {
        expect(body).toContain('no silent caps')
    })
})

describe('finding-schema', () => {
    it('defines the category taxonomy', () => {
        expect(body).toContain('prompt-bloat')
        expect(body).toContain('cost-hotspot')
        expect(body).toContain('skill-defect')
    })

    it('requires luca_surface attribution and confidence', () => {
        expect(body).toContain('luca_surface')
        expect(body).toContain('confidence')
    })
})

describe('report-sections', () => {
    test('renders every required section header', () => {
        expect(body).toContain('### Executive Summary')
        expect(body).toContain('### Spend & Trends')
        expect(body).toContain('### Reliability')
        expect(body).toContain('### Behavior Smells')
        expect(body).toContain('### Top Findings')
        expect(body).toContain('### Recommended Framework Changes')
        expect(body).toContain('### Appendix')
    })

    it('supports the --artifact publish path without replacing inline output', () => {
        expect(body).toContain('--artifact')
        expect(body).toContain('artifact-design')
        expect(body).toContain('never a replacement')
    })
})

describe('github-issue-feed', () => {
    it('restricts issues to high-confidence findings with a luca_surface', () => {
        expect(body).toContain('**high-confidence** finding with a non-null `luca_surface`')
    })

    it('mandates the fingerprint dedup search before every create', () => {
        expect(body).toContain('Dedup search — mandatory before every create')
        expect(body).toContain('Fingerprint:')
    })

    it('uses the trace-insights label on the luca-framework repo', () => {
        expect(body).toContain('--label trace-insights')
    })

    it('renders would-be issues under --dry-run', () => {
        expect(body).toContain('would-be issues')
    })
})

describe('memory-persistence', () => {
    it('routes each concept family to its vault', () => {
        expect(body).toContain('pitfall:trace-')
        expect(body).toContain('pattern:trace-')
        expect(body).toContain('metric:trace-report-')
        expect(body).toContain('metric:trace-insights-cursor')
    })

    it('dedups insight memories via recall-then-evolve, phrased best-effort', () => {
        expect(body).toContain('mcp__muninn__muninn_recall')
        expect(body).toContain('muninn_evolve')
        expect(body).toContain('best-effort')
    })

    it('resumes from the analysis cursor with a 7d fallback', () => {
        expect(body).toContain(
            '`--since auto` resolves the window from the analysis cursor'
        )
        expect(body).toContain('mode: "recent"')
        expect(body).toContain('lastAnalyzedUntil')
        expect(body).toContain('seenTraceIds')
        expect(body).toContain('fall back to a `7d` window')
    })

    it('skips every MuninnDB write under --dry-run, cursor included', () => {
        expect(body).toContain('no MuninnDB writes (including the cursor)')
    })
})

describe('cadence-and-retention', () => {
    it('warns about the ~14 day shortlived retention', () => {
        expect(body).toContain('~14 day')
        expect(body).toContain('biweekly')
    })
})
