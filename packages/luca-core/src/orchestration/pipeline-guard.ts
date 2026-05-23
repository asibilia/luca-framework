/**
 * Pipeline guard — pure validation of pipeline-step transitions.
 *
 * Ported from `luca-mastracode/src/orchestration/pipeline-guard.ts`,
 * which watched Mastra agent_end events and nudged/forced a missing
 * `workflowState(action: "switch-mode")` call. The Mastra-specific
 * machinery (private-field probing, agent_end subscription, followUp/
 * switchMode refs, the per-turn TurnState mutable singleton) does NOT
 * survive the port — that delivery model is a Mastra concept.
 *
 * What survives is the ALGORITHM:
 *  - Given (current step, requested next step, complexity, oversight),
 *    decide whether the transition is legal.
 *  - Surface a structured verdict the caller can use to allow, block,
 *    nudge, or escalate.
 *
 * The Claude Code delivery vehicle is a `PreToolUse` hook (Phase E-1,
 * lives in `luca-tools`) that fires on `Bash(luca state advance *)`,
 * extracts the requested target step, calls `checkPipelineGuard()`,
 * and exits 0 (allow) / 2 (block) per Claude Code's hook contract.
 *
 * Design constraints:
 *  - PURE. No I/O. No global state. No filesystem reads.
 *  - INPUT is everything the hook needs to gather and pass in.
 *  - OUTPUT is a verdict object — the caller decides how to surface it
 *    (stderr, ledger, telemetry).
 *
 * The legality check delegates to the canonical `PIPELINE_TRANSITIONS`
 * table in `../state/configs/pipeline-transitions.ts` — there's exactly
 * one source of truth for "what counts as a legal transition", and it
 * lives next to the state-machine schema, not here.
 */
import {
    isLegalTransition,
    PIPELINE_TRANSITIONS,
} from '../state/configs/pipeline-transitions.ts'
import type {
    ComplexityLevel,
    OversightMode,
    PipelineStep,
} from '../state/schemas.ts'

/**
 * Reason codes for a guard verdict. Stable strings so callers (hook
 * handler, ledger consumers, telemetry, future tests) can branch on
 * them without parsing free-form `reason` text.
 */
export type PipelineGuardReason =
    | 'ok'
    | 'illegal-transition'
    | 'same-step-no-op'
    | 'unknown-current-step'
    | 'unknown-requested-step'

/**
 * Verdict returned by `checkPipelineGuard`. The caller turns this into
 * a hook exit code + stderr message; this module makes no assumptions
 * about that delivery channel.
 *
 *  - `allowed: true`  — transition is legal; let it proceed.
 *  - `allowed: false` — transition is rejected; surface `reason` and
 *                       `message` to the user.
 *  - `telemetry`      — optional payload the caller can attach to a
 *                       ledger or telemetry event. Populated for
 *                       rejections so retrospective analysis can spot
 *                       repeated illegal-transition attempts.
 */
export interface PipelineGuardVerdict {
    allowed: boolean
    reason: PipelineGuardReason
    /** Human-readable explanation. Safe to print to stderr. */
    message: string
    /** Optional structured payload for ledger/telemetry consumers. */
    telemetry?: PipelineGuardTelemetry
}

/**
 * Telemetry payload describing a guard decision. Mirrored on the
 * `pipeline-guard-rejection` ledger event when the hook chooses to
 * log; not emitted from this pure module.
 */
export interface PipelineGuardTelemetry {
    /** Stable event name a caller can use as the ledger event. */
    event: 'pipeline-guard-rejection' | 'pipeline-guard-pass'
    currentStep: string
    requestedStep: string
    complexity?: ComplexityLevel
    oversight?: OversightMode
    reason: PipelineGuardReason
}

/**
 * Input to `checkPipelineGuard`. All fields are required-from-caller
 * data — the hook handler gathers them from the harness payload and
 * (in the Claude Code case) from `.luca/state.json`.
 *
 *  - `currentStep`  — what `.luca/state.json` says the pipeline is in.
 *  - `requestedStep` — the target step the agent is trying to advance
 *                      to (typically parsed from the `luca state
 *                      advance <to-step>` argv).
 *  - `complexity` / `oversight` — surface-only; included so future
 *                                  rules can gate on them (e.g. block
 *                                  certain transitions in
 *                                  `human-in-loop` mode) without
 *                                  needing a schema change. Today's
 *                                  algorithm does not branch on them.
 */
export interface PipelineGuardInput {
    currentStep: string
    requestedStep: string
    complexity?: ComplexityLevel
    oversight?: OversightMode
}

/**
 * The set of every valid PipelineStep value, as a Set for O(1) membership
 * checks. We accept arbitrary strings as input (the hook handler can pass
 * whatever it parsed from argv without pre-validating), but we need to
 * reject unknown values rather than letting them slip into the legality
 * lookup as a TypeScript-coerced type.
 *
 * Kept in sync with `PipelineStepValues` in `../state/constants.ts` —
 * we re-derive from the transitions table here to avoid a redundant
 * import; if the table changes, this stays correct.
 */
const VALID_STEPS = new Set(Object.keys(PIPELINE_TRANSITIONS))

/**
 * Decide whether a requested pipeline-step transition should be
 * allowed. Pure function — call it from a hook, a CLI, a test, or any
 * other surface; output is always identical for identical input.
 *
 * The decision tree:
 *   1. Either step is unknown → reject with a typed reason.
 *   2. Same step → reject as a no-op (the state machine has no
 *      self-edges; loop-back is via a distinct prior step).
 *   3. Transition is illegal per `PIPELINE_TRANSITIONS` → reject.
 *   4. Otherwise → allow.
 *
 * The mastracode `executeEnforcement` step (nudge vs. force) does NOT
 * port — Claude Code hooks return allow/deny, not nudge-and-retry. If
 * a future product decision wants soft-nudging via a follow-up
 * UserPromptSubmit message, that's an additional surface, not a
 * change to this verdict shape.
 */
export function checkPipelineGuard(
    input: PipelineGuardInput,
): PipelineGuardVerdict {
    const { currentStep, requestedStep, complexity, oversight } = input

    if (!VALID_STEPS.has(currentStep)) {
        return {
            allowed: false,
            reason: 'unknown-current-step',
            message:
                `pipeline-guard: current pipelineStep '${currentStep}' is not a known step. ` +
                `state.json may be corrupted or pre-migration; rebuild via 'luca state read'.`,
            telemetry: buildTelemetry(
                'pipeline-guard-rejection',
                currentStep,
                requestedStep,
                'unknown-current-step',
                complexity,
                oversight,
            ),
        }
    }

    if (!VALID_STEPS.has(requestedStep)) {
        return {
            allowed: false,
            reason: 'unknown-requested-step',
            message:
                `pipeline-guard: requested step '${requestedStep}' is not a known pipelineStep. ` +
                `Valid steps: ${Array.from(VALID_STEPS).join(', ')}.`,
            telemetry: buildTelemetry(
                'pipeline-guard-rejection',
                currentStep,
                requestedStep,
                'unknown-requested-step',
                complexity,
                oversight,
            ),
        }
    }

    if (currentStep === requestedStep) {
        return {
            allowed: false,
            reason: 'same-step-no-op',
            message:
                `pipeline-guard: already at pipelineStep '${currentStep}'. ` +
                `Transitions to the same step are no-ops; use the next legal step.`,
            telemetry: buildTelemetry(
                'pipeline-guard-rejection',
                currentStep,
                requestedStep,
                'same-step-no-op',
                complexity,
                oversight,
            ),
        }
    }

    // Cast is safe: VALID_STEPS membership guarantees these are
    // PipelineStep values, but the input arrives as arbitrary strings.
    if (!isLegalTransition(
        currentStep as PipelineStep,
        requestedStep as PipelineStep,
    )) {
        const allowed = PIPELINE_TRANSITIONS[currentStep as PipelineStep]
        return {
            allowed: false,
            reason: 'illegal-transition',
            message:
                `pipeline-guard: '${currentStep}' → '${requestedStep}' is not a legal pipeline transition. ` +
                `From '${currentStep}', the allowed next steps are: ${allowed.join(', ')}.`,
            telemetry: buildTelemetry(
                'pipeline-guard-rejection',
                currentStep,
                requestedStep,
                'illegal-transition',
                complexity,
                oversight,
            ),
        }
    }

    return {
        allowed: true,
        reason: 'ok',
        message: `pipeline-guard: '${currentStep}' → '${requestedStep}' is legal.`,
        telemetry: buildTelemetry(
            'pipeline-guard-pass',
            currentStep,
            requestedStep,
            'ok',
            complexity,
            oversight,
        ),
    }
}

function buildTelemetry(
    event: PipelineGuardTelemetry['event'],
    currentStep: string,
    requestedStep: string,
    reason: PipelineGuardReason,
    complexity?: ComplexityLevel,
    oversight?: OversightMode,
): PipelineGuardTelemetry {
    return {
        event,
        currentStep,
        requestedStep,
        reason,
        ...(complexity !== undefined ? { complexity } : {}),
        ...(oversight !== undefined ? { oversight } : {}),
    }
}
