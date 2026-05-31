/**
 * Context refresher — pure decision function for whether to surface a
 * mid-conversation `<luca-reminder>` to combat context rot.
 *
 * Ported from `luca-mastracode/src/orchestration/context-refresher.ts`,
 * which subscribed to a Mastra `TokenBudgetMonitor` and called
 * `followUpRef({ content })` to inject a reminder at the INJECT_REMINDERS
 * threshold (30% utilization). The Mastra-specific delivery (token-
 * budget subscription, followUpRef, Mastra mode IDs like
 * `luca:4-execute`, the per-mode `injectedThresholds` set living on a
 * class instance) does NOT survive the port — Claude Code does not
 * expose a context-window utilization signal to hooks, and there is no
 * persistent class instance across hook invocations.
 *
 * What survives is the ALGORITHM:
 *
 *  - A small set of per-pipelineStep reminder templates (the same
 *    "you are in <mode> — keep budgets/scope tight" reminders the
 *    mastracode original surfaced, retargeted from mode IDs to
 *    luca-core pipelineSteps).
 *  - A "fire once per (step, refresh window)" cooldown: after a
 *    refresh fires for the current step, suppress further refreshes
 *    until either the step changes OR enough additional tool-call
 *    ticks accumulate to clear the cooldown.
 *  - A deterministic proxy for the token-budget threshold: number of
 *    tool calls since the last refresh. Claude Code does not expose a
 *    context-window utilization API to hooks, so we count tool-call
 *    invocations as the carrier signal — every PostToolUse event ticks
 *    the counter, and the algorithm fires when the counter crosses a
 *    threshold AND the cooldown is clear.
 *
 * The Claude Code delivery vehicle is a `PostToolUse` hook (Phase E-4,
 * lives in `luca-tools`) with matcher `*` so it fires after every tool
 * call. The handler maintains a sidecar `.claude/cache/
 * context-refresher-state.json` that tracks `toolCallCount`,
 * `lastFiredStep`, and `lastFiredAt` so this pure algorithm can stay
 * stateless across invocations.
 *
 * Design constraints:
 *  - PURE. No I/O. No global state. No filesystem reads.
 *  - INPUT is everything the hook needs to gather and pass in.
 *  - OUTPUT is either a verdict object or null when no refresh is
 *    appropriate (e.g. cooldown active, current step is `idle`, or
 *    the counter hasn't crossed the threshold yet).
 *
 * Why a sidecar instead of extending the luca-core state schema or
 * counting from the ledger:
 *
 *  - The `.luca/` contract is a strict allowlist of pipeline-state
 *    artifacts; adding a new root file for hook bookkeeping would
 *    violate that contract.
 *  - The ledger doesn't record raw tool-call ticks (it tracks pipeline
 *    events), so counting from it would mean inventing a new event
 *    type that ALSO has to be cleaned up at Phase H.
 *  - A `.claude/cache/` sidecar is the right home for hook-managed
 *    state — it lives next to the hook handler, is independently
 *    discardable, and doesn't ride on either the pipeline state
 *    schema or the ledger format.
 */
import { coarsePhaseOf } from '../state/helpers/coarse-phase-of.ts'
import type {
    ComplexityLevel,
    OversightMode,
    PipelineStep,
} from '../state/schemas.ts'

import {
    CONTEXT_REFRESHER_DEFAULTS,
    type ContextRefresherThresholds,
} from './context-refresher-config.ts'

/**
 * Reason codes for a refresher verdict. Stable strings so callers
 * (hook handler, ledger consumers, telemetry, future tests) can branch
 * on them without parsing free-form `message` text.
 */
export type ContextRefresherReason =
    | 'refresh-emitted'
    | 'no-refresh-idle-step'
    | 'no-refresh-counter-below-threshold'
    | 'no-refresh-cooldown-active'
    | 'unknown-current-step'

/**
 * Severity hint a caller can use to style the surfaced message. Most
 * refreshes are `info`; `warn` is reserved for edge cases (today just
 * `unknown-current-step`, a data-integrity warning).
 */
export type ContextRefresherSeverity = 'info' | 'warn'

/**
 * Verdict returned by `computeContextRefresher`. The caller turns this
 * into a hook stdout payload (Claude Code's `additionalContext`
 * channel) and/or persists the new sidecar state — this module makes
 * no assumptions about either delivery.
 *
 *  - `message`   — the refresher prompt, already `<system-reminder>`-
 *                  wrapped so the caller can pass it directly to
 *                  `additionalContext`.
 *  - `severity`  — `info` for normal refreshes, `warn` for unknown
 *                  steps (state.json corruption).
 *  - `telemetry` — optional structured payload the caller can attach
 *                  to a ledger event.
 *  - `nextState` — the sidecar state the handler should persist after
 *                  acting on this verdict (counter reset, lastFiredStep
 *                  updated, etc.). Present only when the verdict
 *                  changes state; absent when there is nothing new to
 *                  write.
 */
export interface ContextRefresherVerdict {
    message: string
    severity: ContextRefresherSeverity
    reason: ContextRefresherReason
    telemetry?: ContextRefresherTelemetry
    nextState?: ContextRefresherCarryState
}

/**
 * Telemetry payload describing a refresh decision. The handler may
 * emit (or drop) these via a ledger event; the algorithm only builds
 * the structure.
 */
export interface ContextRefresherTelemetry {
    event: 'context-refresher-emitted' | 'context-refresher-skipped'
    currentStep: string
    previousFiredStep?: string
    toolCallCount: number
    reason: ContextRefresherReason
    complexity?: ComplexityLevel
    oversight?: OversightMode
}

/**
 * Persistent state the hook handler carries between invocations via
 * the `.claude/cache/context-refresher-state.json` sidecar. The
 * algorithm reads + returns this shape so the handler never has to
 * reason about counter resets or step transitions itself.
 *
 *  - `toolCallCount`     — running count of tool calls observed since
 *                          the most recent refresh fired. The handler
 *                          increments this BEFORE calling the
 *                          algorithm; the algorithm decides whether
 *                          the new value crosses the threshold and
 *                          either fires (and resets the counter) or
 *                          carries the new value forward.
 *  - `lastFiredStep`     — the pipelineStep that was current when the
 *                          most recent refresh fired. Used to clear
 *                          the cooldown automatically on step change
 *                          (mirrors mastracode's `setMode()` clearing
 *                          `injectedThresholds`).
 *  - `lastFiredAt`       — ISO timestamp of the most recent fire.
 *                          Currently unused by the algorithm but
 *                          persisted for postmortem/observability.
 */
export interface ContextRefresherCarryState {
    toolCallCount: number
    lastFiredStep?: string
    lastFiredAt?: string
}

/**
 * Input to `computeContextRefresher`. All fields are required-from-
 * caller data — the hook handler gathers them from `.luca/state.json`
 * (current step), the sidecar file (prior carry state), and a fresh
 * timestamp (now).
 *
 *  - `currentStep`        — the pipeline step the agent is currently
 *                           in. Read from state.json AT HOOK INVOCATION
 *                           TIME (PostToolUse fires after the tool
 *                           ran, but BEFORE any subsequent state
 *                           transition).
 *  - `priorState`         — the sidecar state from the previous fire,
 *                           with `toolCallCount` already incremented to
 *                           reflect THIS invocation. Pass an empty
 *                           object on first-ever invocation.
 *  - `now`                — current timestamp (ISO string). Injected
 *                           so the algorithm stays pure (no `new
 *                           Date()` inside).
 *  - `complexity` /
 *    `oversight`          — context the telemetry surfaces; not used
 *                           by the decision itself today.
 *  - `thresholds`         — optional override of refresh thresholds.
 *                           Defaults to `CONTEXT_REFRESHER_DEFAULTS`.
 */
export interface ContextRefresherInput {
    currentStep: string
    priorState: ContextRefresherCarryState
    now: string
    complexity?: ComplexityLevel
    oversight?: OversightMode
    thresholds?: ContextRefresherThresholds
}

/**
 * Pipeline steps that warrant a refresh reminder. Like
 * `continuation-messages`, the partition is derived from
 * `coarsePhaseOf`: every step whose coarse phase is one of
 * PLANNING / EXECUTING / REVIEWING / FINALIZING earns a refresher; the
 * `idle` step (coarse phase `IDLE`) does not.
 */
type RefresherStep = Exclude<PipelineStep, 'idle'>

/**
 * Per-step reminder templates. Concise prompts (one or two sentences)
 * that re-anchor the agent on the active mode's constraints when
 * context starts drifting.
 *
 * Ported from `luca-mastracode/src/orchestration/context-refresher.ts`'s
 * `MODE_REMINDERS`, with the source mastracode mode IDs (`luca:1-
 * triage`, `luca:4-execute`, ...) replaced by luca-core's
 * pipelineStep vocabulary. Stock-Mastra modes (`build`, `plan`,
 * `fast`) do not map cleanly to a pipelineStep — they were utility
 * modes for the mastracode harness and are intentionally dropped.
 *
 * The `<luca-reminder>` tag name matches the mastracode original
 * (rather than the broader `<system-reminder>` envelope used by
 * `continuation-messages`) because this hook surfaces a tactical
 * mid-conversation nudge, distinct from the kick-off prompt
 * continuation-messages emits on a step change.
 */
const STEP_REMINDERS: Record<RefresherStep, string> = {
    triage:
        '<luca-reminder>You are in triage. ≤75 words output. Classify → rationale → next step. Do NOT implement.</luca-reminder>',
    research:
        '<luca-reminder>You are in research. Budget: MODERATE ≤10, COMPLEX ≤20, CRITICAL ≤30 tool calls. Synthesis ≤200 lines.</luca-reminder>',
    discuss:
        '<luca-reminder>Discuss (read-only). Under 300 words per turn. ≤2 clarifying questions. Persist decisions to context.md.</luca-reminder>',
    architect:
        '<luca-reminder>You are in architect mode. ≤3 sentences per task. ≤150 lines PLAN.md total. Validate with plan-reviewer before finishing.</luca-reminder>',
    plan:
        '<luca-reminder>You are in plan mode. Atomic tasks, each verifiable. Keep PLAN.md ≤150 lines. No code yet.</luca-reminder>',
    'plan-review':
        '<luca-reminder>Plan-review (read-only). Validate atomicity/verifiability/traceability. Surface gaps; do not edit the plan in place.</luca-reminder>',
    execute:
        '<luca-reminder>You are in execute mode. Run `luca checks run` within 1 tool call of wave completion. Stalled ≥2 iterations = stop and escalate. No prose between tool calls.</luca-reminder>',
    checks:
        '<luca-reminder>You are in checks. Run the verification harness. On failure, loop back to execute with a focused fix list. No prose.</luca-reminder>',
    verify:
        '<luca-reminder>You are in verify. Compare changes against plan + acceptance criteria. Produce verify.json; on failure loop back to checks.</luca-reminder>',
    review:
        '<luca-reminder>You are in review mode (read-only). Maximum 5 MUST-FIX items. MUST-FIX = correctness bugs, security, missing requirements ONLY.</luca-reminder>',
    learn:
        '<luca-reminder>You are in learn mode. Capture patterns/decisions/pitfalls in MuninnDB + learn.md. Be concrete. ≤200 lines.</luca-reminder>',
    milestone:
        '<luca-reminder>You are in milestone mode. Close the milestone: versioned roadmap + audit snapshot under .luca/milestones/.</luca-reminder>',
    complete:
        '<luca-reminder>You are in complete mode. Finalize metrics, surface the PR if appropriate, then advance to idle.</luca-reminder>',
}

/**
 * Decide whether to emit a refresher reminder for the current
 * pipelineStep, given the prior tool-call counter and the per-step
 * cooldown state.
 *
 * Decision tree:
 *   1. `currentStep` is not a known PipelineStep → return a `warn`
 *      verdict (state.json corruption). The hook handler treats this
 *      as fail-open silence; the verdict carries telemetry for the
 *      diagnostic trail.
 *   2. `currentStep` is `idle` → return null (nothing to remind the
 *      agent about when the pipeline is parked) AND reset the counter
 *      in nextState so we start fresh when the pipeline re-enters an
 *      active step.
 *   3. The cooldown is active (lastFiredStep === currentStep AND
 *      counter < threshold) → return null + carry state forward.
 *   4. The cooldown was cleared by a step change (lastFiredStep set
 *      AND !== currentStep) → fire immediately on entry; the new step
 *      deserves its own reminder.
 *   5. counter >= threshold (first fire for currentStep or post-
 *      cooldown) → fire; reset counter, mark lastFiredStep.
 *   6. counter < threshold AND no prior fire for currentStep → return
 *      null + carry state forward.
 *
 * Pure function — call it from a hook, a CLI, a test, or any other
 * surface; output is identical for identical input.
 */
export function computeContextRefresher(
    input: ContextRefresherInput,
): ContextRefresherVerdict | null {
    const {
        currentStep,
        priorState,
        now,
        complexity,
        oversight,
    } = input
    const thresholds = input.thresholds ?? CONTEXT_REFRESHER_DEFAULTS

    if (!isKnownPipelineStep(currentStep)) {
        return {
            message: '',
            severity: 'warn',
            reason: 'unknown-current-step',
            telemetry: buildTelemetry(
                'context-refresher-skipped',
                currentStep,
                'unknown-current-step',
                priorState,
                complexity,
                oversight,
            ),
        }
    }

    if (currentStep === 'idle') {
        // Nothing to remind. Reset the counter so we start fresh when
        // the pipeline re-enters an active step; clear lastFiredStep
        // since the idle interlude breaks the per-step cooldown.
        const nextState: ContextRefresherCarryState = {
            toolCallCount: 0,
        }
        return null === maybeReturnNull(nextState, priorState)
            ? null
            : {
                  message: '',
                  severity: 'info',
                  reason: 'no-refresh-idle-step',
                  telemetry: buildTelemetry(
                      'context-refresher-skipped',
                      currentStep,
                      'no-refresh-idle-step',
                      priorState,
                      complexity,
                      oversight,
                  ),
                  nextState,
              }
    }

    // `currentStep` is known and not `idle`, so it's a RefresherStep
    // by construction. Cast is safe (the type guard above narrowed
    // currentStep to PipelineStep, and idle is excluded right above).
    const step = currentStep as RefresherStep

    const prevStep = priorState.lastFiredStep
    const counter = priorState.toolCallCount
    const stepChanged = prevStep !== undefined && prevStep !== step

    // Decision: fire when EITHER the step changed since the last fire
    // (re-anchor the agent on the new mode) OR the counter has crossed
    // the threshold within the current step.
    const shouldFire =
        stepChanged || counter >= thresholds.toolCallsPerRefresh

    if (!shouldFire) {
        const reason: ContextRefresherReason =
            prevStep === step
                ? 'no-refresh-cooldown-active'
                : 'no-refresh-counter-below-threshold'
        return {
            message: '',
            severity: 'info',
            reason,
            telemetry: buildTelemetry(
                'context-refresher-skipped',
                currentStep,
                reason,
                priorState,
                complexity,
                oversight,
            ),
            // Carry the incremented counter forward unchanged; the
            // handler already incremented it before calling us.
            nextState: {
                toolCallCount: counter,
                ...(prevStep !== undefined ? { lastFiredStep: prevStep } : {}),
                ...(priorState.lastFiredAt !== undefined
                    ? { lastFiredAt: priorState.lastFiredAt }
                    : {}),
            },
        }
    }

    const message = STEP_REMINDERS[step]

    return {
        message,
        severity: 'info',
        reason: 'refresh-emitted',
        telemetry: buildTelemetry(
            'context-refresher-emitted',
            currentStep,
            'refresh-emitted',
            priorState,
            complexity,
            oversight,
        ),
        // Reset the counter; mark this step + timestamp as the most
        // recent fire so the next invocation knows the cooldown is
        // active until the counter accumulates again.
        nextState: {
            toolCallCount: 0,
            lastFiredStep: step,
            lastFiredAt: now,
        },
    }
}

/**
 * Compare a prospective `nextState` against the prior state. Returns
 * null when they are equivalent (so the caller can skip a no-op disk
 * write) and the prospective state otherwise.
 */
function maybeReturnNull(
    nextState: ContextRefresherCarryState,
    priorState: ContextRefresherCarryState,
): ContextRefresherCarryState | null {
    if (
        nextState.toolCallCount === priorState.toolCallCount &&
        nextState.lastFiredStep === priorState.lastFiredStep &&
        nextState.lastFiredAt === priorState.lastFiredAt
    ) {
        return null
    }
    return nextState
}

/**
 * Type guard: is the given string a known PipelineStep?
 *
 * Exhaustiveness check is built from a typed record over `PipelineStep`
 * so adding a step to the schema without updating this guard is a
 * compile error.
 */
function isKnownPipelineStep(step: string): step is PipelineStep {
    return ALL_PIPELINE_STEPS_SET.has(step)
}

const ALL_PIPELINE_STEPS_TABLE: Record<PipelineStep, true> = {
    idle: true,
    triage: true,
    research: true,
    discuss: true,
    architect: true,
    plan: true,
    'plan-review': true,
    execute: true,
    checks: true,
    verify: true,
    review: true,
    learn: true,
    milestone: true,
    complete: true,
}
const ALL_PIPELINE_STEPS_SET = new Set<string>(
    Object.keys(ALL_PIPELINE_STEPS_TABLE),
)

// Dev-time guard: STEP_REMINDERS must cover every non-idle PipelineStep.
// If a new step is added without a reminder the build fails here (the
// Record<RefresherStep, string> already enforces this at compile time;
// the runtime check below is belt-and-suspenders for the rare case
// where the Record's exhaustiveness gets relaxed during a refactor).
for (const step of Object.keys(ALL_PIPELINE_STEPS_TABLE) as PipelineStep[]) {
    if (step === 'idle') continue
    if (STEP_REMINDERS[step as RefresherStep] === undefined) {
        throw new Error(
            `context-refresher: STEP_REMINDERS is missing an entry for ` +
                `pipelineStep '${step}'. Add a reminder or extend the ` +
                `coarse-phase map if this step shouldn't emit a reminder.`,
        )
    }
}

// Dev-time guard: every reminder targets a step whose coarse phase is
// NOT IDLE. This is structurally true today (RefresherStep =
// Exclude<PipelineStep, 'idle'>), but if the schema ever sprouts a
// new IDLE-coarse step the assertion below will catch it.
for (const step of Object.keys(STEP_REMINDERS) as RefresherStep[]) {
    if (coarsePhaseOf(step) === 'IDLE') {
        throw new Error(
            `context-refresher: STEP_REMINDERS includes step '${step}' ` +
                `whose coarse phase is IDLE. IDLE steps never emit ` +
                `reminders — drop the entry from STEP_REMINDERS.`,
        )
    }
}

function buildTelemetry(
    event: ContextRefresherTelemetry['event'],
    currentStep: string,
    reason: ContextRefresherReason,
    priorState: ContextRefresherCarryState,
    complexity: ComplexityLevel | undefined,
    oversight: OversightMode | undefined,
): ContextRefresherTelemetry {
    return {
        event,
        currentStep,
        toolCallCount: priorState.toolCallCount,
        reason,
        ...(priorState.lastFiredStep !== undefined
            ? { previousFiredStep: priorState.lastFiredStep }
            : {}),
        ...(complexity !== undefined ? { complexity } : {}),
        ...(oversight !== undefined ? { oversight } : {}),
    }
}
