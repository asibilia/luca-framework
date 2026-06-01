import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
    appendLedger,
    isLegalTransition,
    phasePathFor,
    PIPELINE_STEP_TO_COARSE_PHASE,
    PipelineStep,
    PipelineStepValues,
    PIPELINE_TRANSITIONS,
    resolveActiveSlug,
    STEP_ARTIFACTS,
    type CoarsePhase,
    type LucaState,
    type StepArtifact,
} from '@alecsibilia/luca-core'

import { tickPhaseTasks } from '../../utils/plan-checkboxes.ts'
import { z, type ToolDescriptor } from '../__schemas/write-surface.schemas.ts'
import { mutateState } from '../helpers/mutate-state.ts'

const inputSchema = z.object({
    toStep: PipelineStep.describe(
        'Target pipelineStep. Must be a legal transition from the current step (see the pipeline-transitions table).'
    ),
})

/**
 * Ordinal index of a pipelineStep in the canonical pipeline order.
 *
 * Used to detect "re-entry" — when advancing to a step earlier in the
 * pipeline than the current step (e.g. `checks → execute`, `verify → checks`,
 * `learn → plan`). Self-loops (e.g. `research → research`) are not
 * considered re-entries; they're advisory re-research signals.
 */
function stepOrdinal(step: PipelineStep): number {
    return PipelineStepValues.indexOf(step)
}

/**
 * Per-step "expected artifact" map. When the FROM step is mapped to a
 * concrete file, advancing OUT of that step without that file existing
 * signals an empty/skipped step — captured as a `phase-empty-justification`
 * event.
 *
 * Synthetic step-artifact keys (`execute/wave`, `audits/*`) are excluded:
 * they're parameterised (per-wave / per-reviewer) and don't map to a
 * single canonical file. The `execute` step also produces an
 * `execute/summary.md`, which IS deterministic — and that's the file we
 * check.
 */
const EMPTY_STEP_CHECK: Partial<Record<PipelineStep, StepArtifact>> = {
    research: 'research',
    discuss: 'context',
    plan: 'plan',
    'plan-review': 'plan-review',
    execute: 'execute/summary',
    verify: 'verify',
    learn: 'learn',
}

/**
 * Map a synthetic `StepArtifact` key to its on-disk filename relative to
 * the phase directory. Only the keys present in `EMPTY_STEP_CHECK` are
 * recognised here — the parameterised keys (`execute/wave`, `audits/*`)
 * never reach this mapper.
 */
function expectedArtifactPath(
    cwd: string,
    slug: string,
    key: StepArtifact
): string | null {
    // The keys in EMPTY_STEP_CHECK all map cleanly to PhaseFile keys, so
    // we can delegate to phasePathFor.
    switch (key) {
        case 'research':
        case 'context':
        case 'plan':
        case 'plan-review':
        case 'verify':
        case 'learn':
            return join(cwd, phasePathFor(slug, key))
        case 'execute/summary':
            return join(cwd, phasePathFor(slug, 'execute/summary'))
        default:
            // Synthetic keys (execute/wave, audits/*, confidence,
            // execute/progress) — not covered by EMPTY_STEP_CHECK; this
            // branch is unreachable under current usage but is here to
            // preserve exhaustiveness for future extensions.
            return null
    }
}

export const lucaStateAdvanceTool: ToolDescriptor<z.infer<typeof inputSchema>> =
    {
        name: 'luca_state_advance',
        description:
            'Atomically advance the workflow pipelineStep. Validates the transition against the pipeline-transitions table; legal forward + loop-back transitions allowed, illegal jumps rejected.',
        inputSchema,
        async handler(args, ctx) {
            const to = args.toStep
            let from!: PipelineStep
            let state: LucaState
            try {
                // Serialized read-modify-write under the .luca/state.json lock,
                // with a strict read (no silent defaults). This is what stops a
                // concurrent agent's stale-state write from reverting the
                // advance mid-run — the v13 pipelineStep-reversion corruption.
                state = await mutateState(ctx.cwd, (s) => {
                    from = s.pipelineStep
                    if (!isLegalTransition(s.pipelineStep, to)) {
                        const allowed =
                            PIPELINE_TRANSITIONS[s.pipelineStep].join(', ')
                        throw new Error(
                            `illegal transition: '${s.pipelineStep}' → '${to}'. Allowed next steps from '${s.pipelineStep}': [${allowed}].`
                        )
                    }
                    return { ...s, pipelineStep: to }
                })
            } catch (err) {
                return {
                    content: [
                        { type: 'text', text: (err as Error).message },
                    ],
                    isError: true,
                }
            }

            // ---- F3: emit ledger side-effect events --------------------
            //
            // The state.json write above is the atomic, must-succeed step.
            // The ledger emissions below are advisory — wrapped in a
            // best-effort try/catch so a ledger write failure (disk full,
            // permissions, etc.) never blocks the state advance itself.
            // Failure-open semantics per the F-3 ledger contract.
            //
            // Events emitted (postmortem analyzer scans for these — the
            // event NAMES and data SHAPES below must match the reader in
            // luca-core/analysis/postmortem.ts + ledger.ts):
            //   - mode-transition            (always — counted as
            //                                 metrics.modeTransitions)
            //   - pipeline-re-entered        (when `to` is an earlier
            //                                 step than `from`, i.e. a
            //                                 loop-back / fix iteration;
            //                                 reader keys on `targetMode`
            //                                 + `reason` → PIPELINE_RE_ENTERED)
            //   - phase-empty-detected       (when leaving a step that
            //                                 should have produced an
            //                                 artifact and didn't → reader
            //                                 raises STEP_ARTIFACT_MISSING).
            //                                 NOTE: deliberately NOT
            //                                 `phase-empty-justification` —
            //                                 that event is read as PROOF an
            //                                 operator justified an empty
            //                                 phase, so reusing it here would
            //                                 INVERT the signal (suppress the
            //                                 very violation we want to raise).
            try {
                const runId = typeof state.sessionId === 'string'
                    ? state.sessionId
                    : ''

                // Always: mode-transition (the metric the postmortem
                // analyzer counts as metrics.modeTransitions).
                appendLedger({
                    cwd: ctx.cwd,
                    runId,
                    event: 'mode-transition',
                    data: { from, to },
                })

                // Conditional: pipeline-re-entered. We emit when `to` is at
                // an earlier ordinal than `from` in PipelineStepValues —
                // i.e. a documented loop-back transition (e.g.
                // checks → execute, verify → checks, learn → plan,
                // plan-review → plan, complete → idle). Same-step
                // self-loops (research → research) are NOT re-entries;
                // they're advisory re-research signals captured by
                // mode-transition. The reader (postmortem.ts) keys on
                // `targetMode` + `reason`, so we emit those field names.
                if (stepOrdinal(to) < stepOrdinal(from)) {
                    appendLedger({
                        cwd: ctx.cwd,
                        runId,
                        event: 'pipeline-re-entered',
                        data: {
                            targetMode: to,
                            from,
                            reason: `loop-back from '${from}' to '${to}' (rework / fix iteration)`,
                        },
                    })
                }

                // Conditional: phase-empty-detected. If the FROM
                // step had an expected artifact and that file does not
                // exist on disk, the step was skipped/empty — emit the
                // event so the shadow scanner / postmortem analyzer can
                // surface it (as a STEP_ARTIFACT_MISSING violation).
                //
                // Resolution path: we need an active slug to address
                // `<slug>/...`. If `resolveActiveSlug` errors (no active
                // phase yet — currentPhase=0), skip the check silently:
                // there's no phase context to attribute the empty step
                // to.
                const expectedKey = EMPTY_STEP_CHECK[from]
                if (expectedKey !== undefined) {
                    // Only relevant when STEP_ARTIFACTS actually lists
                    // this artifact for the FROM step (defense against
                    // accidental drift between EMPTY_STEP_CHECK and
                    // STEP_ARTIFACTS).
                    const declared = STEP_ARTIFACTS[from] as StepArtifact[]
                    if (declared.includes(expectedKey)) {
                        const slugResult = resolveActiveSlug(state)
                        if (slugResult.ok) {
                            const artifactPath = expectedArtifactPath(
                                ctx.cwd,
                                slugResult.slug,
                                expectedKey
                            )
                            if (
                                artifactPath !== null &&
                                !existsSync(artifactPath)
                            ) {
                                appendLedger({
                                    cwd: ctx.cwd,
                                    runId,
                                    event: 'phase-empty-detected',
                                    data: {
                                        from,
                                        to,
                                        slug: slugResult.slug,
                                        expectedArtifact: expectedKey,
                                        reason:
                                            `step '${from}' advanced to '${to}' without writing its expected ` +
                                            `artifact ('${expectedKey}') — possible empty/skipped step`,
                                    },
                                })
                            }
                        }
                    }
                }
            } catch {
                // Failure-open: never block a state advance on a ledger
                // emission failure. The state.json write already
                // succeeded — the ledger is an advisory side-channel.
            }

            // ---- CF1: plan.md checkbox auto-tick ------------------------
            //
            // Ported from mastracode `util/plan-checkboxes.ts` per
            // parity-review §CF1. The original trigger was the legacy
            // `complete-phase` action with `reviewPassed === true`; the
            // new v13 surface has no `complete-phase` — the equivalent
            // "execution attested" moment is the boundary OUT of the
            // EXECUTING coarse phase (i.e. `from ∈ {execute, checks}`
            // and the `to` step belongs to a different coarse phase).
            // Practically that's `checks → verify`.
            //
            // Behaviour is advisory: any failure (missing plan.md, no
            // matching heading, write error) is captured in the
            // `tickPhaseTasks` return value and emitted to the ledger
            // as `plan-tick-result` — never throws, never blocks the
            // state advance.
            try {
                const fromCoarse: CoarsePhase = PIPELINE_STEP_TO_COARSE_PHASE[from]
                const toCoarse: CoarsePhase = PIPELINE_STEP_TO_COARSE_PHASE[to]
                if (fromCoarse === 'EXECUTING' && toCoarse !== 'EXECUTING') {
                    const slugResult = resolveActiveSlug(state)
                    if (slugResult.ok) {
                        const planFile = join(
                            ctx.cwd,
                            phasePathFor(slugResult.slug, 'plan')
                        )
                        // Phase name for the plan-section heading
                        // match: the roadmap entry's `.name`, which is
                        // what mastracode used.
                        const roadmapEntry = state.roadmap[state.currentPhase - 1]
                        const phaseName = roadmapEntry?.name ?? slugResult.slug
                        const tickResult = tickPhaseTasks(planFile, phaseName)
                        const runIdForTick = typeof state.sessionId === 'string'
                            ? state.sessionId
                            : ''
                        appendLedger({
                            cwd: ctx.cwd,
                            runId: runIdForTick,
                            event: 'plan-tick-result',
                            data: {
                                phase: phaseName,
                                slug: slugResult.slug,
                                planFile: tickResult.planFile,
                                success: tickResult.success,
                                tickedCount: tickResult.tickedCount,
                                alreadyTickedCount:
                                    tickResult.alreadyTickedCount,
                                reason: tickResult.reason ?? null,
                            },
                        })
                    }
                }
            } catch {
                // Best-effort advisory; never fail state advance on a
                // plan-tick failure.
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: `pipelineStep advanced: '${from}' → '${to}'`,
                    },
                ],
            }
        },
    }
