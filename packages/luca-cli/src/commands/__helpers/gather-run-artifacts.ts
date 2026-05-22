/**
 * Assemble a run's postmortem inputs from the `.luca/` artifacts.
 *
 * luca-core's `analyzeRun` is pure — it takes a run's ledger entries,
 * verification results, and confidence entries as explicit arguments. This
 * helper is the CLI-side gatherer that reads those artifacts off disk:
 *
 *   - ledger entries — `.luca/ledger.jsonl`, scoped to the runId.
 *   - verification results — each `.luca/phases/<slug>/verify.json` whose
 *     stamped runId matches (run-staleness filter via `currentRunId`).
 *   - confidence entries — every `.luca/phases/<slug>/confidence.jsonl`.
 *     ConfidenceEntry carries no runId, so it cannot be run-scoped; the
 *     postmortem uses confidence only for an aggregate low-confidence count.
 *
 * Shared by `luca retro` and `luca rules suggest`.
 */
import { existsSync, readdirSync } from 'node:fs'

import { join } from 'pathe'

import {
    PHASE_SLUG_RE,
    readConfidenceJournal,
    readLedgerForRun,
    readVerificationResult,
} from '@alecsibilia/luca-core'
import type {
    AnalyzeRunInput,
    ConfidenceEntry,
    VerificationResult,
} from '@alecsibilia/luca-core'

/** List the valid phase slugs present under `.luca/phases/`. */
function listPhaseSlugs(cwd: string): string[] {
    const phasesDir = join(cwd, '.luca', 'phases')
    if (!existsSync(phasesDir)) return []
    try {
        return readdirSync(phasesDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && PHASE_SLUG_RE.test(e.name))
            .map((e) => e.name)
    } catch {
        return []
    }
}

/** Assemble the {@link AnalyzeRunInput} for a run from its `.luca/` artifacts. */
export function gatherRunArtifacts(opts: {
    cwd: string
    runId: string
}): AnalyzeRunInput {
    const { cwd, runId } = opts
    const verifications: VerificationResult[] = []
    const confidence: ConfidenceEntry[] = []

    for (const slug of listPhaseSlugs(cwd)) {
        const verification = readVerificationResult({
            cwd,
            slug,
            currentRunId: runId,
        })
        if (verification) verifications.push(verification)
        confidence.push(...readConfidenceJournal({ cwd, slug }))
    }

    return {
        runId,
        entries: readLedgerForRun({ cwd, runId }),
        verifications,
        confidence,
    }
}
