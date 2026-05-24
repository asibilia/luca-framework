/**
 * Postmortem — structured retrospective analysis of a Luca pipeline run.
 *
 * {@link analyzeRun} scans a run's session-ledger entries (plus its
 * verification results and confidence entries) for seven classes of
 * pipeline-discipline violation, and produces a {@link PostmortemReport} for
 * programmatic gating plus pre-formatted `pitfall` payloads for MuninnDB.
 *
 * Ported from luca-mastracode `analysis/postmortem.ts`. Changes from the
 * mastracode original:
 *   - `analyzeRun` is pure: it takes the run's ledger entries, verification
 *     results, and confidence entries as explicit arguments rather than
 *     reading `.planning/` artifacts (and the dropped `.planning/runs/<id>/`
 *     archive layout) itself. The caller — the `luca retro` CLI in Phase C —
 *     assembles the inputs from the luca-core ledger/verification/confidence
 *     readers.
 *   - `renderPostmortemMarkdown` returns the markdown string only;
 *     `writePostmortem` / `readPostmortem` are not ported — the `.luca/`
 *     phase-dir contract has no `POSTMORTEM.md` slot, so callers render on
 *     demand (same disposition as `CONFIDENCE-JOURNAL.md`).
 *
 * Pitfalls are always routed to the canonical `default` vault for
 * cross-project aggregation — see {@link PostmortemReport.pitfalls}.
 */
import type { ConfidenceEntry } from '../confidence/index.ts'
import type { LedgerEntry } from '../ledger/index.ts'
import type { VerificationResult } from '../verification/index.ts'

import type { PhaseDiff } from './phase-diff.ts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationCode =
    | 'EMPTY_PHASE_NO_JUSTIFICATION'
    | 'TODO_DONE_NO_VERIFICATION'
    | 'FORCED_TRANSITION'
    | 'LOW_CONFIDENCE_THRESHOLD'
    | 'WAVE_NO_VERIFICATION'
    | 'PIPELINE_RE_ENTERED'
    | 'PIPELINE_GUARD_IDLE_BYPASS'

export type ViolationSeverity = 'critical' | 'warning'

export interface Violation {
    severity: ViolationSeverity
    code: ViolationCode
    message: string
    evidence: string
    /** Stable fingerprint for idempotent MuninnDB storage. */
    evidenceFingerprint: string
}

export interface PhaseSummary {
    name: string
    startedAt?: string
    completedAt?: string
    diff?: PhaseDiff
    justification?: { category: string; reasoning: string; at?: string }
    verifications: VerificationResult[]
    todosMovedToDone: Array<{ slug: string; verificationRef: unknown }>
}

export interface PostmortemReport {
    runId: string
    startedAt?: string
    endedAt?: string
    durationMs?: number
    phases: PhaseSummary[]
    violations: Violation[]
    metrics: {
        totalEvents: number
        modeTransitions: number
        phasesCompleted: number
        emptyPhasesJustified: number
        todosMovedToDone: number
        lowConfidenceCount: number
        forcedTransitions: number
        moveBlockedCount: number
    }
    /**
     * Pre-formatted MuninnDB pitfall payloads.
     *
     * Pitfalls are always written to the canonical `default` vault for
     * cross-project aggregation, regardless of the per-repo `muninn.vault`
     * setting. This is intentional — postmortem patterns must aggregate
     * across all luca pipelines to surface systemic regressions.
     */
    pitfalls: Array<{
        vault: 'default'
        concept: string
        type: 'pitfall'
        content: string
        tags: string[]
        op_id: string
    }>
}

/** Inputs for {@link analyzeRun} — the run's already-loaded artifacts. */
export interface AnalyzeRunInput {
    /** Run identifier the report is scoped to. */
    runId: string
    /** Session-ledger entries for this run (already filtered by runId). */
    entries: LedgerEntry[]
    /** Verification results for this run's phases. */
    verifications: VerificationResult[]
    /** Confidence-journal entries for this run. */
    confidence: ConfidenceEntry[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fingerprint(input: string): string {
    // Cheap deterministic hash; we just need uniqueness within a run.
    let hash = 0
    for (let i = 0; i < input.length; i++) {
        hash = (hash << 5) - hash + input.charCodeAt(i)
        hash |= 0
    }
    return Math.abs(hash).toString(36)
}

const LOW_CONFIDENCE_THRESHOLD = 3

function eventDataString(e: LedgerEntry, key: string): string | undefined {
    const v = e.data[key]
    return typeof v === 'string' ? v : undefined
}

/**
 * Walk forwards through ledger entries up to `at`, returning the name of the
 * most recent `phase-start`. Used to attribute todo-moved-to-done events.
 */
function mostRecentPhaseAt(
    entries: LedgerEntry[],
    at: string
): string | undefined {
    const target = new Date(at).getTime()
    let best: string | undefined
    for (const e of entries) {
        if (e.event !== 'phase-start') continue
        if (new Date(e.timestamp).getTime() > target) break
        const name = eventDataString(e, 'phase')
        if (name) best = name
    }
    return best
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

/** Analyze a pipeline run for discipline violations and produce a report. */
export function analyzeRun(input: AnalyzeRunInput): PostmortemReport {
    const { runId: targetRunId, entries, verifications, confidence } = input

    const startedAt = entries[0]?.timestamp
    const endedAt = entries[entries.length - 1]?.timestamp
    const durationMs =
        startedAt && endedAt
            ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
            : undefined

    // ── Group events by phase ─────────────────────────────────────────────
    const phaseMap = new Map<string, PhaseSummary>()
    function getPhase(name: string): PhaseSummary {
        let p = phaseMap.get(name)
        if (!p) {
            p = { name, verifications: [], todosMovedToDone: [] }
            phaseMap.set(name, p)
        }
        return p
    }

    for (const e of entries) {
        const phaseName = eventDataString(e, 'phase')
        switch (e.event) {
            case 'phase-start': {
                if (phaseName) getPhase(phaseName).startedAt = e.timestamp
                break
            }
            case 'phase-complete': {
                if (phaseName) getPhase(phaseName).completedAt = e.timestamp
                break
            }
            case 'phase-diff-summary': {
                if (!phaseName) break
                getPhase(phaseName).diff = {
                    filesChanged: Array.isArray(e.data.filesChanged)
                        ? (e.data.filesChanged as string[])
                        : [],
                    commitsAdded: Array.isArray(e.data.commitsAdded)
                        ? (e.data.commitsAdded as string[])
                        : [],
                    isEmpty: e.data.isEmpty === true,
                    indeterminate: e.data.indeterminate === true,
                }
                break
            }
            case 'phase-empty-justification': {
                if (!phaseName) break
                getPhase(phaseName).justification = {
                    category: eventDataString(e, 'category') ?? 'unknown',
                    reasoning: eventDataString(e, 'reasoning') ?? '',
                    at: e.timestamp,
                }
                break
            }
            case 'todo-moved-to-done': {
                const recentPhase = mostRecentPhaseAt(entries, e.timestamp)
                if (recentPhase) {
                    getPhase(recentPhase).todosMovedToDone.push({
                        slug: eventDataString(e, 'slug') ?? '<unknown>',
                        verificationRef: e.data.verificationRef ?? null,
                    })
                }
                break
            }
        }
    }

    // Attach verification history per phase by name.
    for (const v of verifications) {
        if (v.phase) getPhase(v.phase).verifications.push(v)
    }

    const phases = Array.from(phaseMap.values())

    // ── Detect violations ─────────────────────────────────────────────────
    const violations: Violation[] = []

    // 1. Empty phase without justification — only completed phases count. A
    //    blocked complete-phase attempt still writes a phase-diff-summary but
    //    the phase never finished; flagging it would double-count a
    //    already-blocked unsafe action.
    for (const p of phases) {
        if (!p.completedAt) continue
        if (p.diff?.isEmpty && !p.justification) {
            violations.push({
                severity: 'critical',
                code: 'EMPTY_PHASE_NO_JUSTIFICATION',
                message: `Phase "${p.name}" completed with zero file changes and zero commits but has no phase-empty-justification entry.`,
                evidence: `phase=${p.name} completedAt=${p.completedAt}`,
                evidenceFingerprint: fingerprint(
                    `EMPTY_PHASE:${p.name}:${p.completedAt}`
                ),
            })
        }
    }

    // 2. Todos moved to done without a verificationRef. Blocked attempts are
    //    warnings (the gate already prevented the transition); an actual
    //    unsafe transition is critical.
    const moveBlocked = entries.filter((e) => e.event === 'todo-move-blocked')
    for (const e of moveBlocked) {
        violations.push({
            severity: 'warning',
            code: 'TODO_DONE_NO_VERIFICATION',
            message: `Blocked attempt to move todo "${eventDataString(e, 'identifier') ?? '?'}" to done without a valid verificationRef. Tool layer prevented the unsafe transition.`,
            evidence: `reason=${eventDataString(e, 'reason') ?? '?'} at=${e.timestamp}`,
            evidenceFingerprint: fingerprint(
                `TODO_BLOCKED:${eventDataString(e, 'identifier') ?? ''}:${e.timestamp}`
            ),
        })
    }
    for (const p of phases) {
        for (const t of p.todosMovedToDone) {
            if (!t.verificationRef) {
                violations.push({
                    severity: 'critical',
                    code: 'TODO_DONE_NO_VERIFICATION',
                    message: `Todo "${t.slug}" moved to done without a verificationRef in phase "${p.name}".`,
                    evidence: `phase=${p.name} slug=${t.slug}`,
                    evidenceFingerprint: fingerprint(
                        `TODO_NOREF:${p.name}:${t.slug}`
                    ),
                })
            }
        }
    }

    // 3. Forced transitions (warning — pipeline-guard intervened).
    const forced = entries.filter(
        (e) => e.event === 'pipeline-forced-transition'
    )
    for (const e of forced) {
        violations.push({
            severity: 'warning',
            code: 'FORCED_TRANSITION',
            message: `Pipeline-guard force-transitioned the agent (it failed to call switch-mode).`,
            evidence: `from=${eventDataString(e, 'from') ?? '?'} to=${eventDataString(e, 'to') ?? '?'} at=${e.timestamp}`,
            evidenceFingerprint: fingerprint(
                `FORCED:${e.timestamp}:${eventDataString(e, 'from') ?? ''}`
            ),
        })
    }

    // 4. Low-confidence-threshold breach (warning).
    const lowConfidence = confidence.filter((c) => c.confidence === 'low')
    if (lowConfidence.length >= LOW_CONFIDENCE_THRESHOLD) {
        violations.push({
            severity: 'warning',
            code: 'LOW_CONFIDENCE_THRESHOLD',
            message: `${lowConfidence.length} low-confidence executor decisions (threshold=${LOW_CONFIDENCE_THRESHOLD}). Human review recommended before merge.`,
            evidence: `count=${lowConfidence.length} categories=${lowConfidence.map((c) => c.category).join(',')}`,
            evidenceFingerprint: fingerprint(
                `LOWCONF:${lowConfidence.length}:${targetRunId}`
            ),
        })
    }

    // 5. Wave advance blocked (warning — tool layer prevented the transition).
    const waveBlocked = entries.filter(
        (e) => e.event === 'wave-advance-blocked'
    )
    for (const e of waveBlocked) {
        violations.push({
            severity: 'warning',
            code: 'WAVE_NO_VERIFICATION',
            message: `Blocked attempt to advance wave without verification-result. Tool layer prevented the unsafe transition.`,
            evidence: `phase=${eventDataString(e, 'phase') ?? '?'} wave=${e.data.wave ?? '?'} at=${e.timestamp}`,
            evidenceFingerprint: fingerprint(
                `WAVE_BLOCKED:${eventDataString(e, 'phase') ?? ''}:${e.data.wave ?? ''}`
            ),
        })
    }

    // 6. Pipeline re-entered (informational warning).
    const reEntered = entries.filter((e) => e.event === 'pipeline-re-entered')
    for (const e of reEntered) {
        violations.push({
            severity: 'warning',
            code: 'PIPELINE_RE_ENTERED',
            message: `Pipeline was re-entered mid-run (often indicates rework).`,
            evidence: `targetMode=${eventDataString(e, 'targetMode') ?? '?'} reason=${eventDataString(e, 'reason') ?? '?'}`,
            evidenceFingerprint: fingerprint(
                `REENTRY:${e.timestamp}:${eventDataString(e, 'targetMode') ?? ''}`
            ),
        })
    }

    // 7. Pipeline-guard idle bypass (warning — silent skip risk).
    const idleBypass = entries.filter(
        (e) => e.event === 'pipeline-guard-idle-bypass'
    )
    for (const e of idleBypass) {
        violations.push({
            severity: 'warning',
            code: 'PIPELINE_GUARD_IDLE_BYPASS',
            message: `Pipeline-guard skipped enforcement because pipelineStep was idle. May indicate stale state contamination.`,
            evidence: `at=${e.timestamp}`,
            evidenceFingerprint: fingerprint(`IDLE_BYPASS:${e.timestamp}`),
        })
    }

    // ── Metrics ───────────────────────────────────────────────────────────
    const metrics = {
        totalEvents: entries.length,
        modeTransitions: entries.filter((e) => e.event === 'mode-transition')
            .length,
        phasesCompleted: entries.filter((e) => e.event === 'phase-complete')
            .length,
        emptyPhasesJustified: entries.filter(
            (e) => e.event === 'phase-empty-justification'
        ).length,
        todosMovedToDone: entries.filter(
            (e) => e.event === 'todo-moved-to-done'
        ).length,
        lowConfidenceCount: lowConfidence.length,
        forcedTransitions: forced.length,
        moveBlockedCount: moveBlocked.length,
    }

    // ── Pitfall payloads (canonical `default` vault) ──────────────────────
    const critical = violations.filter((v) => v.severity === 'critical')
    const pitfalls = critical.map((v) => ({
        vault: 'default' as const,
        concept: `pitfall:${v.code.toLowerCase().replace(/_/g, '-')}`,
        type: 'pitfall' as const,
        content: `## ${v.code}\n\n${v.message}\n\n**Evidence**: ${v.evidence}\n\n**Run**: ${targetRunId}`,
        tags: ['luca', 'pipeline', 'postmortem', v.code.toLowerCase()],
        op_id: `${targetRunId}:${v.code}:${v.evidenceFingerprint}`,
    }))

    return {
        runId: targetRunId,
        startedAt,
        endedAt,
        durationMs,
        phases,
        violations,
        metrics,
        pitfalls,
    }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Exit-code helper
// ---------------------------------------------------------------------------

/**
 * Compute the process exit code for a postmortem report.
 *
 * Returns `1` if the report contains any `critical`-severity violation,
 * `0` otherwise. Pure — the CLI surface (`luca retro` in luca-cli)
 * decides whether to call `process.exit(...)` / `process.exitCode = ...`
 * with the result.
 *
 * Mirrors the legacy mastracode `retro.ts` semantics:
 *   `process.exit(critical.length > 0 ? 1 : 0)`
 *
 * Audit ref CF5 — the legacy CLI exited non-zero on any critical
 * violation. The v13 port lost that signal, so any pipeline gate that
 * piped `luca retro` to `||` is now silently inert. This helper makes
 * the contract explicit and testable; the CLI calls it.
 */
export function computePostmortemExitCode(report: PostmortemReport): 0 | 1 {
    return report.violations.some((v) => v.severity === 'critical') ? 1 : 0
}

/** Render a postmortem report as human-readable Markdown. Pure. */
export function renderPostmortemMarkdown(report: PostmortemReport): string {
    const lines: string[] = []
    lines.push(`# Postmortem — Run ${report.runId}`, '')
    lines.push(`- **Started**: ${report.startedAt ?? 'unknown'}`)
    lines.push(`- **Ended**: ${report.endedAt ?? 'unknown'}`)
    if (report.durationMs !== undefined) {
        lines.push(`- **Duration**: ${Math.round(report.durationMs / 60_000)} min`)
    }
    lines.push('')

    const critical = report.violations.filter((v) => v.severity === 'critical')
    const warnings = report.violations.filter((v) => v.severity === 'warning')
    lines.push('## Violations', '')
    lines.push(`- **Critical**: ${critical.length}`)
    lines.push(`- **Warning**: ${warnings.length}`, '')

    if (report.violations.length > 0) {
        lines.push('| Severity | Code | Message |', '| --- | --- | --- |')
        for (const v of report.violations) {
            lines.push(
                `| ${v.severity} | \`${v.code}\` | ${v.message.replace(/\|/g, '\\|')} |`
            )
        }
        lines.push('')
    }

    lines.push('## Phases', '')
    if (report.phases.length === 0) {
        lines.push('_No phases recorded._', '')
    }
    for (const p of report.phases) {
        lines.push(`### ${p.name}`, '')
        lines.push(
            `- Started: ${p.startedAt ?? '?'} | Completed: ${p.completedAt ?? '?'}`
        )
        if (p.diff) {
            const status = p.diff.indeterminate
                ? '_(indeterminate — non-git or no snapshot)_'
                : p.diff.isEmpty
                  ? '⚠ EMPTY'
                  : `${p.diff.filesChanged.length} files, ${p.diff.commitsAdded.length} commits`
            lines.push(`- Diff: ${status}`)
        }
        if (p.justification) {
            lines.push(
                `- Empty-phase justification: \`${p.justification.category}\` — ${p.justification.reasoning}`
            )
        }
        if (p.verifications.length > 0) {
            lines.push(
                `- Verifications: ${p.verifications.map((v) => `wave ${v.wave}: ${v.status}`).join(', ')}`
            )
        }
        if (p.todosMovedToDone.length > 0) {
            lines.push(
                `- Todos moved to done: ${p.todosMovedToDone.map((t) => t.slug).join(', ')}`
            )
        }
        lines.push('')
    }

    lines.push('## Metrics', '')
    for (const [k, v] of Object.entries(report.metrics)) {
        lines.push(`- **${k}**: ${v}`)
    }
    lines.push('')

    lines.push('## What to do next', '')
    if (critical.length > 0) {
        lines.push(
            '- 🛑 **Critical violations present.** Finalize cannot create a PR until these are resolved. Re-enter pipeline at execute or review.'
        )
    } else if (warnings.length > 0) {
        lines.push(
            '- ⚠ Warnings present but non-blocking. Review the table above before merging.'
        )
    } else {
        lines.push('- ✅ No violations detected. Run is clean.')
    }
    lines.push('')

    return lines.join('\n')
}
