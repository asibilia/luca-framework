/**
 * Machine-verdict adapter — reproduces the full `checkPipelineGuard` contract
 * on top of the XState pipeline machine.
 *
 * This is the parity bridge: given the same `(currentStep, requestedStep)`
 * input as the legacy guard, it returns an identical `allowed` verdict, an
 * identical reason code, and the resulting step. The golden parity harness
 * drives BOTH this adapter and `checkPipelineGuard` over all 169 pairs and
 * asserts they never disagree.
 *
 * Decision tree (mirrors `checkPipelineGuard` EXACTLY):
 *   1. `currentStep` unknown  -> unknown-current-step   (ABOVE the machine)
 *   2. `requestedStep` unknown -> unknown-requested-step (ABOVE the machine)
 *   3. legal (`snapshot.can`)  -> ok
 *   4. illegal & from === to   -> same-step-no-op
 *   5. illegal & from !== to   -> illegal-transition
 *
 * The unknown-step checks run ABOVE the machine because `resolveState` THROWS
 * on an unknown state value (spike 3) — a bogus step must never reach it.
 *
 * LOAD-BEARING ordering: legality (`.can`) is checked BEFORE the same-step
 * classification, so the legal self-loop `research -> research` is `ok`, while
 * an illegal self-edge (e.g. `idle -> idle`) is `same-step-no-op`. This
 * matches the legacy guard, where `isLegalTransition` runs before the
 * `current === requested` branch.
 */
import { transition } from 'xstate'

import { PIPELINE_TRANSITIONS } from '../configs/pipeline-transitions.ts'
import type {
    PipelineGuardInput,
    PipelineGuardReason,
} from '../../orchestration/pipeline-guard.ts'
import type { PipelineStep } from '../schemas.ts'
import { FIX_LOOP_EDGES, type FixLoopCounter } from './actions.ts'
import {
    pipelineMachine,
    STEP_TO_STATE_VALUE,
    stateValueToLeaf,
    type PipelineContext,
} from './pipeline-machine.ts'

/**
 * The set of valid PipelineStep values (O(1) membership). Derived from the
 * canonical transitions table — same source the legacy guard's `VALID_STEPS`
 * uses — so the two never diverge on what counts as "known".
 */
const VALID_STEPS = new Set<string>(Object.keys(PIPELINE_TRANSITIONS))

/**
 * Additive, OPTIONAL input for the fix-loop counter write-back (DAD-P1c).
 *
 * A superset of `PipelineGuardInput`: every field here is optional, so the
 * existing 2-arg call `machineVerdict({currentStep, requestedStep})` in the
 * parity harness still type-checks (protects anti-01). Absent counters + an
 * absent `budgetMode` mean advisory — the machine runs exactly as it did in
 * P1b, and `counterUpdate` is only produced when the persisted counter for the
 * traversed edge was tracked.
 */
export interface MachineVerdictInput extends PipelineGuardInput {
    checksFixIteration?: number
    verifyIteration?: number
    reviewIteration?: number
    maxChecksFixIterations?: number
    maxVerifyIterations?: number
    maxReviewIterations?: number
    budgetMode?: 'advisory' | 'enforce'
}

/**
 * The post-transition value of the counter mutated on a fix-loop edge, ready
 * for the write path to persist. Present only when the advance traversed one
 * of the 6 fix-loop edges AND the counter was tracked in the input.
 */
export interface CounterUpdate {
    field: FixLoopCounter
    value: number
}

/**
 * The verdict shape this adapter returns. A structural subset of
 * `PipelineGuardVerdict` (no `message`/`telemetry`) plus `resultingStep` —
 * exactly what the parity harness compares. `counterUpdate` is additive +
 * optional, so the parity assertions (which ignore it) are unchanged.
 */
export interface MachineVerdict {
    allowed: boolean
    reason: PipelineGuardReason
    /** Where the machine ends up: the destination on allow, or `from` on deny. */
    resultingStep: string
    /** Fix-loop counter write-back (DAD-P1c); absent on non-fix-loop advances. */
    counterUpdate?: CounterUpdate
}

/**
 * Compute the machine's verdict for a guard input. Pure; identical output for
 * identical input.
 *
 * Takes a single `PipelineGuardInput`-shaped object (same shape as
 * `checkPipelineGuard`) so P1b can drop this in as a verdict-equivalent
 * replacement. `complexity`/`oversight` are threaded into the machine context
 * (surface-only in P1a — no guard reads them — but `resolveState` requires a
 * context because the machine's context type differs from XState's default
 * `MachineContext`).
 */
export function machineVerdict(input: MachineVerdictInput): MachineVerdict {
    const { currentStep, requestedStep, complexity, oversight } = input
    // Thread persisted counters/caps/budgetMode into context (all optional —
    // undefined ⇒ advisory, and an untracked counter makes the assign a no-op).
    const context: PipelineContext = {
        complexity,
        oversight,
        checksFixIteration: input.checksFixIteration,
        verifyIteration: input.verifyIteration,
        reviewIteration: input.reviewIteration,
        maxChecksFixIterations: input.maxChecksFixIterations,
        maxVerifyIterations: input.maxVerifyIterations,
        maxReviewIterations: input.maxReviewIterations,
        budgetMode: input.budgetMode,
    }

    // 1 + 2: unknown steps are gated ABOVE the machine (resolveState throws).
    if (!VALID_STEPS.has(currentStep)) {
        return {
            allowed: false,
            reason: 'unknown-current-step',
            resultingStep: currentStep,
        }
    }
    if (!VALID_STEPS.has(requestedStep)) {
        return {
            allowed: false,
            reason: 'unknown-requested-step',
            resultingStep: currentStep,
        }
    }

    // Both steps are valid: rehydrate the machine at `from` and consult the
    // `.can` oracle for the ADVANCE event (spike 2: reliable, including the
    // legal self-loop).
    const from = currentStep as PipelineStep
    const to = requestedStep as PipelineStep
    const snapshot = pipelineMachine.resolveState({
        value: STEP_TO_STATE_VALUE[from],
        context,
    })
    const event = { type: 'ADVANCE', to } as const

    if (snapshot.can(event)) {
        // 3: legal. Drive the real transition to get the resulting leaf AND the
        // post-assign context (the fix-loop actions ran synchronously inside
        // `transition`).
        const [next] = transition(pipelineMachine, snapshot, event)
        // If this edge is one of the 6 fix-loop edges, report the counter's
        // post-transition value for the write path to persist. The assign is a
        // no-op when the counter was untracked, so we only surface an update
        // when the input actually carried that counter.
        const edge = FIX_LOOP_EDGES[`${from}->${to}`]
        let counterUpdate: CounterUpdate | undefined
        if (edge !== undefined) {
            const value = (next.context as PipelineContext)[edge.counter]
            if (value !== undefined) {
                counterUpdate = { field: edge.counter, value }
            }
        }
        return {
            allowed: true,
            reason: 'ok',
            resultingStep: stateValueToLeaf(next.value),
            ...(counterUpdate ? { counterUpdate } : {}),
        }
    }

    // Illegal. Classify exactly as legacy does.
    if (from === to) {
        // 4: illegal self-edge -> same-step-no-op.
        return {
            allowed: false,
            reason: 'same-step-no-op',
            resultingStep: from,
        }
    }
    // 5: illegal cross-step -> illegal-transition.
    return {
        allowed: false,
        reason: 'illegal-transition',
        resultingStep: from,
    }
}
