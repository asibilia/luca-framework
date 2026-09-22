import { existsSync } from 'node:fs'
import { join } from 'node:path'

import {
    appendLedger,
    BUDGET_BY_COMPLEXITY,
    checkPipelineGuard,
    coarsePhaseOf,
    DEFAULT_BUDGET,
    fixLoopCounterUpdate,
    lucaStateSchema,
    phasePathFor,
    PipelineStep,
    PipelineStepValues,
    PIPELINE_TRANSITIONS,
    resolveActiveSlug,
    REWORK_EDGE_CAPS,
    STEP_ARTIFACTS,
    stringifyError,
    type CoarsePhase,
    type CounterUpdate,
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

/**
 * Pure decision seam for a pipeline-step advance.
 *
 * The transition gate is `checkPipelineGuard` — the SOLE verdict engine, and
 * the same one the PreToolUse pipeline-guard hook calls. (It was briefly
 * fronted by an machine-backed `machineVerdict` oracle whose machine was
 * GENERATED from `PIPELINE_TRANSITIONS`; a 169-pair parity harness proved the
 * two could never disagree, so deleting the machine left the guard as the sole
 * engine at zero behavioural cost.)
 *
 * Returns the resulting `pipelineStep` on a legal advance, or THROWS a generic
 * `Error` on rejection. Callers catch the generic `Error` and surface
 * `stringifyError(err)` — so this keeps the throw shape stable while enriching
 * the message with the guard's reason code.
 *
 * The rejection message embeds the guard's `reason` code (e.g.
 * `illegal-transition`, `same-step-no-op`) — so the illegal-transition case
 * naturally retains the substring `illegal` (back-compat with callers/tests
 * that match on it) while a same-step no-op is distinguishable by its own
 * reason code. The message also enumerates the legal next steps from
 * `PIPELINE_TRANSITIONS[from]`.
 *
 * P1c: the fix-loop counters are LIVE. On one of the 6 fix-loop edges,
 * `fixLoopCounterUpdate` computes the post-transition counter value (rework
 * edges increment, forward-exit edges reset to 0) and it is returned alongside
 * the next `pipelineStep`. The caller spreads the update into the ATOMIC state
 * write; every other field is preserved. Dropping it would silently freeze the
 * fix-loop counters at their persisted value and starve the `fixloop-counted`
 * ledger emission below.
 */
export interface AdvanceDecision {
    pipelineStep: PipelineStep
    counterUpdate?: CounterUpdate
}

export function decideAdvance(s: LucaState, to: PipelineStep): AdvanceDecision {
    const from = s.pipelineStep
    const verdict = checkPipelineGuard({
        currentStep: from,
        requestedStep: to,
        complexity: s.complexity,
        oversight: s.oversight,
    })
    if (!verdict.allowed) {
        // Guard the lookup: an unknown `from` (reason `unknown-current-step`)
        // is not a table key, so default to [] rather than TypeError-ing on
        // `.join`. Unreachable via the live Zod-validated read, but this seam
        // is exported and the guard can legitimately return unknown-*.
        const allowed = (PIPELINE_TRANSITIONS[from] ?? []).join(', ')
        throw new Error(
            `rejected transition [${verdict.reason}]: '${from}' → '${to}'. ` +
                `Allowed next steps from '${from}': [${allowed}].`
        )
    }
    // A legal advance always lands on exactly `to`.
    const counterUpdate = fixLoopCounterUpdate(from, to, {
        checksFixIteration: s.checksFixIteration,
        verifyIteration: s.verifyIteration,
        reviewIteration: s.reviewIteration,
    })
    return {
        pipelineStep: to,
        ...(counterUpdate ? { counterUpdate } : {}),
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
            let counterUpdate: CounterUpdate | undefined
            let state: LucaState
            try {
                // Serialized read-modify-write under the .luca/state.json lock,
                // with a strict read (no silent defaults on a present file).
                // This is what stops a concurrent agent's stale-state write from
                // reverting the advance mid-run — the v13 pipelineStep-reversion
                // corruption.
                //
                // bootstrapIfMissing: an ABSENT state.json is the legitimate
                // first-advance bootstrap (idle → triage on a fresh repo).
                // Seed it from schema defaults so that path keeps working;
                // a present-but-truncated file still throws (corruption).
                state = await mutateState(
                    ctx.cwd,
                    (s) => {
                        from = s.pipelineStep
                        // The transition gate is `checkPipelineGuard` (via
                        // `decideAdvance`) — the same engine the PreToolUse
                        // pipeline-guard hook uses. On a legal advance it
                        // returns the destination step; on rejection it throws
                        // a generic Error whose message carries the reason
                        // code.
                        //
                        // P1c: on a fix-loop edge the decision also carries a
                        // `counterUpdate` (the post-transition counter value).
                        // Spread it into the atomic write so the incremented /
                        // reset counter is persisted with the step change.
                        const decision = decideAdvance(s, to)
                        counterUpdate = decision.counterUpdate
                        // Run-start stamp (#319): the canonical run-start moment
                        // is the first entry into `research` (idle→…→triage→
                        // research). This edge fires exactly once per run, so it
                        // is the authoritative run-start and must ALWAYS refresh
                        // `runStartedAt` — including overwriting a stale stamp
                        // left by a prior in-place re-run on the same state.json
                        // (finalize→idle→triage→research). `to === 'research'` is
                        // load-bearing; the `from` set is defensive against a
                        // direct idle→research jump. The CLI lazy-stamp keeps its
                        // unset-only guard as the legacy fallback.
                        const stampRunStart =
                            to === 'research' &&
                            (from === 'idle' || from === 'triage')
                        return {
                            ...s,
                            pipelineStep: decision.pipelineStep,
                            ...(stampRunStart
                                ? { runStartedAt: new Date().toISOString() }
                                : {}),
                            ...(decision.counterUpdate
                                ? {
                                      [decision.counterUpdate.field]:
                                          decision.counterUpdate.value,
                                  }
                                : {}),
                        }
                    },
                    { bootstrapIfMissing: lucaStateSchema.parse({}) }
                )
            } catch (err) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: stringifyError(err),
                        },
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
                const runId =
                    typeof state.sessionId === 'string' ? state.sessionId : ''

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
                // checks → execute, verify → checks, review → execute,
                // learn → plan, plan-review → plan). Same-step
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

                // Conditional: fixloop-counted (DAD-P1c). When the advance
                // traversed a REWORK edge (checks→execute, verify→checks,
                // review→execute) and a counter was incremented, record an
                // advisory `fixloop-counted` entry. Budget is resolved from
                // complexity via BUDGET_BY_COMPLEXITY at emit time (advisory —
                // the record is logged, never blocked; the enforce flip is a
                // later slice). Forward-exit resets do NOT emit.
                //
                // This used to be a `fixloop.counted` telemetry record. The
                // local telemetry sink was narrowed to recall quality only, so
                // the payload moved onto the ledger — the live local sink,
                // which already carries the matching `pipeline-re-entered`
                // entry for the same edge.
                const reworkCap = REWORK_EDGE_CAPS[`${from}->${to}`]
                if (counterUpdate !== undefined && reworkCap !== undefined) {
                    const limits =
                        state.complexity !== undefined
                            ? BUDGET_BY_COMPLEXITY[state.complexity]
                            : DEFAULT_BUDGET
                    const budget = limits[reworkCap]
                    const nextValue = counterUpdate.value
                    appendLedger({
                        cwd: ctx.cwd,
                        runId,
                        event: 'fixloop-counted',
                        data: {
                            edge: `${from}->${to}`,
                            counterField: counterUpdate.field,
                            nextValue,
                            budget,
                            verdict:
                                nextValue >= budget ? 'exceeded' : 'within',
                            complexity: state.complexity ?? null,
                            oversight: state.oversight ?? null,
                            phaseOfRollout: 'advisory',
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
                const fromCoarse: CoarsePhase = coarsePhaseOf(from)
                const toCoarse: CoarsePhase = coarsePhaseOf(to)
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
                        const roadmapEntry =
                            state.roadmap[state.currentPhase - 1]
                        const phaseName = roadmapEntry?.name ?? slugResult.slug
                        const tickResult = tickPhaseTasks(planFile, phaseName)
                        const runIdForTick =
                            typeof state.sessionId === 'string'
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
