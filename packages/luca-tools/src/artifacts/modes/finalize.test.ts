/**
 * Token contract for the Outcome KPI Persistence directive (REQ-14,
 * phase 04-outcome-kpi-persistence, Wave 2).
 *
 * Step 1 (Milestone Boundary) of the finalize body now instructs the LLM to
 * compute complexity-bucketed outcome KPIs via `luca telemetry kpi --json` and
 * persist one milestone-stamped `metric:outcome-kpi-<version>-<complexity>`
 * memory per bucket to the repo vault resolved from config (`muninn.vault`,
 * fallback `default`). This suite asserts the rendered finalize instructions
 * carry every required token — importing the mode's rendered `.instructions`
 * export (not reading the source file) so the probe exercises the actual
 * materialized body.
 */
import { describe, expect, test } from 'bun:test'

import { finalizeMode } from './finalize.ts'

const REQUIRED_TOKENS = [
    'telemetry kpi',
    'metric:outcome-kpi-',
    'muninn_remember_batch',
    // The generic finalize mode is shipped to every repo, so the directive
    // resolves the vault from .luca/config.json rather than hardcoding a
    // single repo's vault literal.
    'muninn.vault',
    'meanReworkIterations',
    'reEntryRate',
] as const

describe('finalize outcome-kpi persistence directive', () => {
    for (const token of REQUIRED_TOKENS) {
        test(`rendered instructions contain "${token}"`, () => {
            expect(finalizeMode.instructions).toContain(token)
        })
    }
})
