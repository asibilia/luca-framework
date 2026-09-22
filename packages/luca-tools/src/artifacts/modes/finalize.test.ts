/**
 * Token contract for the Outcome KPI Persistence directive (REQ-14,
 * phase 04-outcome-kpi-persistence, Wave 2).
 *
 * Narrowed with the telemetry sink: the two telemetry-derived KPIs
 * (`meanReworkIterations`, `reEntryRate`) retired with `signal.satisfaction`;
 * the two artifact-derived KPIs survive and are asserted here, with the
 * retired pair asserted ABSENT so they cannot drift back in.
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
    'lowConfidenceRatio',
    'firstPassVerifyRate',
] as const

// `meanReworkIterations` / `reEntryRate` were derived from
// `signal.satisfaction` telemetry, which retired with the local sink. The
// directive must NOT ask the LLM to persist a KPI the compute no longer
// returns — it would render as `undefined` in the memory body.
const FORBIDDEN_TOKENS = ['meanReworkIterations', 'reEntryRate'] as const

describe('finalize outcome-kpi persistence directive', () => {
    for (const token of REQUIRED_TOKENS) {
        test(`rendered instructions contain "${token}"`, () => {
            expect(finalizeMode.instructions).toContain(token)
        })
    }

    for (const token of FORBIDDEN_TOKENS) {
        test(`rendered instructions do NOT mention retired "${token}"`, () => {
            expect(finalizeMode.instructions).not.toContain(token)
        })
    }
})
