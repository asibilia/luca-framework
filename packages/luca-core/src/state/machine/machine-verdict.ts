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
import type { PipelineGuardReason } from '../../orchestration/pipeline-guard.ts'
import type { PipelineStep } from '../schemas.ts'
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
 * The verdict shape this adapter returns. A structural subset of
 * `PipelineGuardVerdict` (no `message`/`telemetry`) plus `resultingStep` —
 * exactly what the parity harness compares.
 */
export interface MachineVerdict {
    allowed: boolean
    reason: PipelineGuardReason
    /** Where the machine ends up: the destination on allow, or `from` on deny. */
    resultingStep: string
}

/**
 * Default parity context. Surface-only — no guard reads it. Provided because
 * `resolveState` requires a context when the machine's context type differs
 * from the XState default `MachineContext`.
 */
function defaultContext(): PipelineContext {
    return {}
}

/**
 * Compute the machine's verdict for a `(from, to)` step pair. Pure; identical
 * output for identical input.
 */
export function machineVerdict(
    currentStep: string,
    requestedStep: string,
    context: PipelineContext = defaultContext()
): MachineVerdict {
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
        // 3: legal. Drive the real transition to get the resulting leaf.
        const [next] = transition(pipelineMachine, snapshot, event)
        return {
            allowed: true,
            reason: 'ok',
            resultingStep: stateValueToLeaf(next.value),
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
