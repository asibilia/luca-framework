/**
 * Postmortem — structured retrospective analysis of a Luca pipeline run.
 *
 * Reads the four append-only JSONL artifacts under `.planning/`:
 *   - session-ledger.jsonl       (mode/phase events, guards, diff summaries)
 *   - verification-history.jsonl (per-wave PASS/FAIL/STALLED verdicts)
 *   - confidence-journal.jsonl   (executor ambiguity decisions)
 *   - routing-history.jsonl      (model routing decisions)
 *
 * Produces:
 *   - A structured `PostmortemReport` for programmatic gating.
 *   - A human-readable `.planning/POSTMORTEM.md` rendering.
 *   - An optional list of `pitfall` payloads the agent should forward to
 *     MuninnDB (default vault) so future runs can recall recurring failures.
 */
import {
    existsSync,
    writeFileSync,
    mkdirSync,
    readFileSync,
} from 'node:fs'
import { join } from 'node:path'

import {
    readLedger,
    readLedgerForRun,
    getCurrentRunId,
    listRuns,
    listArchivedRuns,
    resolveRunArtifactDir,
    readJsonlAt,
    ARTIFACT_FILES,
    type LedgerEntry,
} from './session-ledger.js'
import {
    readVerificationHistory,
    type VerificationResult,
} from './verification-result.js'
import {
    readConfidenceJournal,
    type ConfidenceEntry,
} from './confidence-journal.js'

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
    /** Stable fingerprint for idempotent MuninnDB storage */
    evidenceFingerprint: string
}

export interface PhaseSummary {
    name: string
    startedAt?: string
    completedAt?: string
    diff?: {
        filesChanged: string[]
        commitsAdded: string[]
        isEmpty: boolean
        indeterminate: boolean
    }
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
    /** Pre-formatted MuninnDB pitfall payloads (default vault). */
    pitfalls: Array<{
        vault: 'default'
        concept: string
        type: 'pitfall'
        content: string
        tags: string[]
        op_id: string
    }>
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

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

export function analyzeRun(runId?: string): PostmortemReport {
    const targetRunId = runId ?? getCurrentRunId()
    const currentRunId = getCurrentRunId()
    const isCurrentRun = targetRunId === currentRunId

    // For the current run, read live `.planning/*.jsonl` artifacts.
    // For archived runs, read from `.planning/runs/<runId>/` so we don't
    // mix in entries from a later run that's now occupying the live files.
    let entries: LedgerEntry[]
    let verifications: VerificationResult[]
    let confidence: ConfidenceEntry[]

    if (isCurrentRun) {
        const all = readLedger()
        entries = all.filter((e) => e.runId === targetRunId)
        verifications = readVerificationHistory()
        confidence = readConfidenceJournal()
    } else {
        const archiveDir = resolveRunArtifactDir(targetRunId)
        if (archiveDir) {
            entries = readJsonlAt<LedgerEntry>(
                archiveDir,
                ARTIFACT_FILES.ledger
            ).filter((e) => e.runId === targetRunId)
            verifications = readJsonlAt<VerificationResult>(
                archiveDir,
                ARTIFACT_FILES.verification
            )
            confidence = readJsonlAt<ConfidenceEntry>(
                archiveDir,
                ARTIFACT_FILES.confidence
            )
        } else {
            // Fall back to filtering the live ledger if no archive exists
            // (e.g. user passed a runId that's still in the live file).
            entries = readLedgerForRun(targetRunId)
            verifications = []
            confidence = []
        }
    }

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
            p = {
                name,
                verifications: [],
                todosMovedToDone: [],
            }
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
                const p = getPhase(phaseName)
                p.diff = {
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
                const p = getPhase(phaseName)
                p.justification = {
                    category: eventDataString(e, 'category') ?? 'unknown',
                    reasoning: eventDataString(e, 'reasoning') ?? '',
                    at: e.timestamp,
                }
                break
            }
            case 'todo-moved-to-done': {
                // Attach to most recent phase by timestamp.
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
        if (v.phase) {
            getPhase(v.phase).verifications.push(v)
        }
    }

    const phases = Array.from(phaseMap.values())

    // ── Detect violations ─────────────────────────────────────────────────
    const violations: Violation[] = []

    // 1. Empty phase without justification
    //
    // Only consider phases that *actually completed*. A blocked
    // `complete-phase` attempt still writes a `phase-diff-summary`
    // entry, but the phase itself never finished — flagging it as
    // critical would double-count an already-blocked unsafe action.
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

    // 2. Todos moved to done without verificationRef
    //
    // Blocked attempts (`todo-move-blocked`) are downgraded to warnings —
    // the gate already prevented the unsafe transition, so this is just
    // signal that the agent tried something and got corrected. Only an
    // actual unsafe transition (todo successfully moved to done without a
    // verificationRef) is critical.
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
    // Belt-and-suspenders: any todos-moved-to-done with falsy verificationRef
    // are real unsafe transitions and must remain critical.
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

    // 3. Forced transitions (warning level — pipeline-guard intervened)
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

    // 4. Low-confidence-threshold breach (warning)
    const lowConfidence = confidence.filter(
        (c: ConfidenceEntry) => c.confidence === 'low'
    )
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

    // 5. Wave advance blocked — downgraded to warning because the tool
    // layer already prevented the unsafe transition. The presence of a
    // block tells us the agent tried, but it didn't actually advance.
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

    // 6. Pipeline re-entered (informational warning)
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

    // 7. Pipeline-guard idle bypass (warning — silent skip risk)
    const idleBypass = entries.filter(
        (e) => e.event === 'pipeline-guard-idle-bypass'
    )
    for (const e of idleBypass) {
        violations.push({
            severity: 'warning',
            code: 'PIPELINE_GUARD_IDLE_BYPASS',
            message: `Pipeline-guard skipped enforcement because pipelineStep was idle. May indicate stale state contamination.`,
            evidence: `at=${e.timestamp}`,
            evidenceFingerprint: fingerprint(
                `IDLE_BYPASS:${e.timestamp}`
            ),
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
        todosMovedToDone: entries.filter((e) => e.event === 'todo-moved-to-done')
            .length,
        lowConfidenceCount: lowConfidence.length,
        forcedTransitions: forced.length,
        moveBlockedCount: moveBlocked.length,
    }

    // ── Pitfall payloads (default vault) ──────────────────────────────────
    const critical = violations.filter((v) => v.severity === 'critical')
    const pitfalls = critical.map((v) => ({
        vault: 'default' as const,
        concept: `pitfall:${v.code.toLowerCase().replace(/_/g, '-')}`,
        type: 'pitfall' as const,
        content: `## ${v.code}\n\n${v.message}\n\n**Evidence**: ${v.evidence}\n\n**Run**: ${targetRunId}`,
        tags: [
            'luca',
            'pipeline',
            'postmortem',
            v.code.toLowerCase(),
        ] as string[],
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

/**
 * Walk backwards through ledger entries from `at` to find the most recent
 * `phase-start` event. Used to attribute todo-moved-to-done events to a phase.
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
// Render
// ---------------------------------------------------------------------------

const POSTMORTEM_FILE = '.planning/POSTMORTEM.md'

function ensurePlanningDir(): void {
    const dir = join(process.cwd(), '.planning')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

export function renderPostmortemMarkdown(report: PostmortemReport): string {
    const lines: string[] = []
    lines.push(`# Postmortem — Run ${report.runId}`)
    lines.push('')
    lines.push(`- **Started**: ${report.startedAt ?? 'unknown'}`)
    lines.push(`- **Ended**: ${report.endedAt ?? 'unknown'}`)
    if (report.durationMs !== undefined) {
        const mins = Math.round(report.durationMs / 60_000)
        lines.push(`- **Duration**: ${mins} min`)
    }
    lines.push('')

    // Violations summary
    const critical = report.violations.filter((v) => v.severity === 'critical')
    const warnings = report.violations.filter((v) => v.severity === 'warning')
    lines.push(`## Violations`)
    lines.push('')
    lines.push(`- **Critical**: ${critical.length}`)
    lines.push(`- **Warning**: ${warnings.length}`)
    lines.push('')

    if (report.violations.length > 0) {
        lines.push(`| Severity | Code | Message |`)
        lines.push(`| --- | --- | --- |`)
        for (const v of report.violations) {
            const msg = v.message.replace(/\|/g, '\\|')
            lines.push(`| ${v.severity} | \`${v.code}\` | ${msg} |`)
        }
        lines.push('')
    }

    // Per-phase summary
    lines.push(`## Phases`)
    lines.push('')
    if (report.phases.length === 0) {
        lines.push('_No phases recorded._')
        lines.push('')
    }
    for (const p of report.phases) {
        lines.push(`### ${p.name}`)
        lines.push('')
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
            const verdicts = p.verifications
                .map((v) => `wave ${v.wave}: ${v.status}`)
                .join(', ')
            lines.push(`- Verifications: ${verdicts}`)
        }
        if (p.todosMovedToDone.length > 0) {
            lines.push(
                `- Todos moved to done: ${p.todosMovedToDone.map((t) => t.slug).join(', ')}`
            )
        }
        lines.push('')
    }

    // Metrics
    lines.push(`## Metrics`)
    lines.push('')
    for (const [k, v] of Object.entries(report.metrics)) {
        lines.push(`- **${k}**: ${v}`)
    }
    lines.push('')

    // Next steps
    lines.push(`## What to do next`)
    lines.push('')
    if (critical.length > 0) {
        lines.push(
            `- 🛑 **Critical violations present.** Finalize cannot create a PR until these are resolved. Re-enter pipeline at execute or review.`
        )
    } else if (warnings.length > 0) {
        lines.push(
            `- ⚠ Warnings present but non-blocking. Review the table above before merging.`
        )
    } else {
        lines.push(`- ✅ No violations detected. Run is clean.`)
    }
    lines.push('')

    return lines.join('\n')
}

export function writePostmortem(report: PostmortemReport): {
    path: string
    bytes: number
} {
    ensurePlanningDir()
    const md = renderPostmortemMarkdown(report)
    const p = join(process.cwd(), POSTMORTEM_FILE)
    writeFileSync(p, md, 'utf-8')
    return { path: POSTMORTEM_FILE, bytes: md.length }
}

export function readPostmortem(): string | null {
    const p = join(process.cwd(), POSTMORTEM_FILE)
    if (!existsSync(p)) return null
    try {
        return readFileSync(p, 'utf-8')
    } catch {
        return null
    }
}

export { listRuns }
