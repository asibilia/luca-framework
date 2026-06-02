/**
 * Continuation messages — pure builder for the kick-off prompt the agent
 * receives after the pipeline advances into a new step.
 *
 * Ported from `luca-mastracode/src/orchestration/continuation-messages.ts`,
 * which fed an `<system-reminder>`-wrapped continuation prompt into the
 * next mode after a Mastra mode switch. The Mastra-specific delivery
 * (followUp ref, Mastra mode IDs like `luca:2-research`, Mastra's
 * `workflowState` tool references, the LucaWorkflowState fields that
 * don't exist in luca-core's narrower schema — intent, assignedTodos,
 * affectedAreas, planFile, roadmapFile, currentPhaseSlug) does NOT
 * survive the port.
 *
 * What survives is the ALGORITHM and the per-step templates:
 *
 *  - Given a freshly-entered `pipelineStep` plus a small slice of state,
 *    decide whether to surface a continuation message and what it says.
 *  - Output is structured: { message, severity?, telemetry? } | null.
 *  - The Claude Code delivery vehicle is a `PostToolUse` hook (Phase E-3,
 *    lives in `luca-tools`) that fires after a `Bash(luca state advance
 *    ...)` invocation, loads the (now-advanced) state, calls this
 *    builder, and emits the message via `additionalContext` in the
 *    hook's JSON output (the channel Claude Code uses for invisible
 *    `<system-reminder>` injections).
 *
 * Design constraints:
 *  - PURE. No I/O. No global state. No filesystem reads.
 *  - INPUT is everything the hook needs to gather and pass in.
 *  - OUTPUT is either a verdict object or null when no continuation is
 *    appropriate (e.g. transitioning into `idle`).
 *
 * The set of steps that warrant a continuation message is derived from
 * `coarsePhaseOf()` rather than hand-curated: every step whose coarse
 * phase is one of PLANNING / EXECUTING / REVIEWING / FINALIZING earns a
 * continuation; transitions INTO `idle` (coarse phase IDLE) emit none.
 * The exhaustive coarse-phase map in `state/configs/coarse-phase-map.ts`
 * is the single source of truth; if a new step is added there, this
 * module either picks up the right default or fails a compile-time
 * exhaustiveness check.
 */
import { coarsePhaseOf } from '../state/helpers/coarse-phase-of.ts'
import type {
    ComplexityLevel,
    CoarsePhase,
    OversightMode,
    PipelineStep,
} from '../state/schemas.ts'

/**
 * Reason codes for a continuation verdict. Stable strings so callers
 * (hook handler, ledger consumers, telemetry, future tests) can branch
 * on them without parsing free-form `message` text.
 */
export type ContinuationReason =
    | 'continuation-emitted'
    | 'no-continuation-idle-step'
    | 'unknown-current-step'

/**
 * Severity hint a caller can use to style the surfaced message. Most
 * continuations are `info`; `warn` is reserved for edge cases (today
 * just `unknown-current-step`, which is a data-integrity warning).
 */
export type ContinuationSeverity = 'info' | 'warn'

/**
 * Verdict returned by `computeContinuationMessage`. The caller turns
 * this into a hook stdout payload (Claude Code's `additionalContext`
 * channel) — this module makes no assumptions about that delivery.
 *
 *  - `message`   — the continuation prompt. Already includes the
 *                  `<system-reminder>` wrapper so the caller can pass
 *                  it directly to `additionalContext`.
 *  - `severity`  — `info` for normal continuations, `warn` for unknown
 *                  steps (state.json corruption).
 *  - `telemetry` — optional structured payload the caller can attach
 *                  to a ledger event.
 */
export interface ContinuationVerdict {
    message: string
    severity: ContinuationSeverity
    reason: ContinuationReason
    telemetry?: ContinuationTelemetry
}

/**
 * Telemetry payload describing a continuation decision. The handler
 * may emit (or drop) these via `luca telemetry record`; the algorithm
 * only builds the structure.
 */
export interface ContinuationTelemetry {
    /** Stable event name a caller can use as the ledger event. */
    event: 'continuation-emitted' | 'continuation-skipped'
    currentStep: string
    previousStep?: string
    coarsePhase?: CoarsePhase
    complexity?: ComplexityLevel
    oversight?: OversightMode
    reason: ContinuationReason
}

/**
 * Input to `computeContinuationMessage`. All fields are required-from-
 * caller data — the hook handler gathers them from `.luca/state.json`
 * (post-advance) and from the Bash command argv (for `previousStep`,
 * when extractable).
 *
 *  - `currentStep`   — the step the pipeline just entered. Read from
 *                      state.json AFTER `luca state advance` succeeded.
 *  - `previousStep`  — the step the pipeline came from. Optional;
 *                      surfaced in the message envelope when present.
 *  - `complexity` /
 *    `oversight`     — context the message includes verbatim so the
 *                      next mode knows what regime it's in.
 *  - `currentPhase` /
 *    `totalPhases`   — surfaced when both are set, gives the agent a
 *                      "Phase 2/5" anchor in the kick-off prompt.
 */
export interface ContinuationInput {
    currentStep: string
    previousStep?: string
    complexity?: ComplexityLevel
    oversight?: OversightMode
    currentPhase?: number
    totalPhases?: number
}

/**
 * Exhaustive table of every PipelineStep that warrants a continuation
 * message, with its hand-written body. The keys are the canonical
 * `PipelineStep` literals; the values are the per-step prompts (sans
 * envelope — the envelope is composed by `buildContinuation()` below).
 *
 * `idle` is intentionally absent — the coarse-phase short-circuit
 * upstream returns null before this table is consulted.
 *
 * Templates are deliberately concise (one to four sentences). The
 * mastracode originals included `planFile` / `roadmapFile` /
 * `assignedTodos` / `affectedAreas` references that don't survive the
 * port because the luca-core state schema doesn't carry those fields.
 * If a consumer wants those anchors they belong in the per-mode
 * subagent instructions (Phase D-3 artifacts), not in this hook output.
 */
type ContinuationStep = Exclude<PipelineStep, 'idle'>

const STEP_TEMPLATES: Record<ContinuationStep, string> = {
    triage:
        'Begin triage. Parse the request, classify complexity, and advance to research. ' +
        'Do NOT implement anything. Do NOT modify files. ' +
        'Your only job is to classify and transition.',
    research:
        'Begin research. Read the existing state and prior artifacts, investigate the affected areas, ' +
        'and save findings to `.luca/phases/<slug>/research.md`. ' +
        'When research is complete, advance to discuss.',
    discuss:
        'Begin discussion. Gather user decisions for the active phase and persist them as ' +
        '`.luca/phases/<slug>/context.md`. Keep the scope tight — clarifying questions only.',
    architect:
        'Begin architecture. Read research + context, then produce a structured implementation plan ' +
        'using goal-backward analysis. When the plan is approved, advance to plan.',
    plan:
        'Write the phase plan to `.luca/phases/<slug>/plan.md`. Keep tasks atomic and ' +
        'each task verifiable. When the plan is final, advance to plan-review.',
    'plan-review':
        'Review the plan against the research + context. Validate every task is atomic, ' +
        'verifiable, and traceable. Surface gaps as plan-review notes; do not edit the plan in place.',
    execute:
        'Begin execution. Read `.luca/phases/<slug>/plan.md` and implement changes in waves. ' +
        'Run `luca checks run` after each wave. Do NOT re-create the plan. ' +
        'When all waves are complete, advance to checks.',
    checks:
        'Run the verification harness via `luca checks run`. ' +
        'On failure, loop back to execute with a focused fix list. On success, advance to verify.',
    verify:
        'Verify the changes against the plan and acceptance criteria. ' +
        'Produce `verify.json` with the result; on failure loop back to checks.',
    review:
        'Review the code changes against the plan. Spawn reviewer subagents for a multi-perspective ' +
        'audit. Produce REVIEW reports under `audits/`. If must-fix issues are found, loop back to ' +
        'execute; otherwise advance to learn.',
    learn:
        'Capture learnings as patterns/decisions/pitfalls in MuninnDB and as `learn.md`. ' +
        'Then advance to finalize (last phase done) or back to plan (to start the next phase).',
    finalize:
        'Finalize the run: gap audit + postmortem, close the milestone (versioned roadmap + audit ' +
        'snapshot under `.luca/milestones/`), surface the PR, then reset to idle.',
}

/**
 * Wrap a per-step template in the standard envelope. Kept as a single
 * function so the envelope shape is documented in one place; if the
 * presentation contract changes (e.g. drop `<system-reminder>` and use
 * a different tag), there's one site to update.
 *
 * The `<system-reminder>` wrapper matches Claude Code's invisible
 * injection convention (see docs/research/prompt-architecture/
 * 02-context-rot-and-injection.md): tags Claude sees but the user does
 * not.
 */
function buildContinuation(
    step: ContinuationStep,
    coarse: CoarsePhase,
    input: ContinuationInput,
): string {
    const lines: string[] = []
    const arrow =
        input.previousStep !== undefined
            ? `${input.previousStep} → ${step}`
            : step
    lines.push(`<system-reminder>`)
    lines.push(`[Luca Pipeline — entering ${arrow}]`)
    lines.push(`Coarse phase: ${coarse}`)
    if (input.complexity !== undefined) {
        lines.push(`Complexity: ${input.complexity}`)
    }
    if (input.oversight !== undefined) {
        lines.push(`Oversight: ${input.oversight}`)
    }
    if (
        typeof input.currentPhase === 'number' &&
        typeof input.totalPhases === 'number' &&
        input.totalPhases > 0
    ) {
        lines.push(`Phase: ${input.currentPhase}/${input.totalPhases}`)
    }
    lines.push('')
    lines.push(STEP_TEMPLATES[step])
    lines.push(`</system-reminder>`)
    return lines.join('\n')
}

/**
 * Decide whether to emit a continuation message for the just-entered
 * pipeline step, and build it.
 *
 * Decision tree:
 *   1. `currentStep` is not a known PipelineStep → return null + a
 *      `warn` verdict (state.json corruption); the hook handler treats
 *      this as a fail-open and surfaces nothing.
 *   2. `currentStep` is `idle` (coarse phase `IDLE`) → return null;
 *      there is nothing useful to remind the agent about when the
 *      pipeline is parked.
 *   3. Otherwise → look up the per-step template, wrap it in the
 *      envelope, return a `continuation-emitted` verdict.
 *
 * Pure function — call it from a hook, a CLI, a test, or any other
 * surface; output is identical for identical input.
 */
export function computeContinuationMessage(
    input: ContinuationInput,
): ContinuationVerdict | null {
    const { currentStep, previousStep, complexity, oversight } = input

    if (!isKnownPipelineStep(currentStep)) {
        return {
            message: '',
            severity: 'warn',
            reason: 'unknown-current-step',
            telemetry: buildTelemetry(
                'continuation-skipped',
                currentStep,
                'unknown-current-step',
                previousStep,
                undefined,
                complexity,
                oversight,
            ),
        }
    }

    const coarse = coarsePhaseOf(currentStep)

    if (currentStep === 'idle') {
        // Returning null here is the explicit "no continuation" signal
        // the hook handler maps to "emit nothing". The verdict object
        // is reserved for the unknown-step warn path where the caller
        // may want to log telemetry.
        return null
    }

    // `currentStep` is known and not `idle`, so it's a ContinuationStep
    // by construction. Cast is safe.
    const step = currentStep as ContinuationStep
    const message = buildContinuation(step, coarse, input)

    return {
        message,
        severity: 'info',
        reason: 'continuation-emitted',
        telemetry: buildTelemetry(
            'continuation-emitted',
            currentStep,
            'continuation-emitted',
            previousStep,
            coarse,
            complexity,
            oversight,
        ),
    }
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
    finalize: true,
}
const ALL_PIPELINE_STEPS_SET = new Set<string>(
    Object.keys(ALL_PIPELINE_STEPS_TABLE),
)

// Dev-time guard: STEP_TEMPLATES must cover every non-idle PipelineStep.
// If a new step is added without a template the build fails here (the
// Record<ContinuationStep, string> already enforces this at compile
// time; the runtime check below is belt-and-suspenders for the rare
// case where the Record's exhaustiveness gets relaxed during a
// refactor).
for (const step of Object.keys(ALL_PIPELINE_STEPS_TABLE) as PipelineStep[]) {
    if (step === 'idle') continue
    if (STEP_TEMPLATES[step as ContinuationStep] === undefined) {
        throw new Error(
            `continuation-messages: STEP_TEMPLATES is missing an entry for ` +
                `pipelineStep '${step}'. Add a template or extend the ` +
                `coarse-phase map if this step shouldn't emit a continuation.`,
        )
    }
}

function buildTelemetry(
    event: ContinuationTelemetry['event'],
    currentStep: string,
    reason: ContinuationReason,
    previousStep: string | undefined,
    coarsePhase: CoarsePhase | undefined,
    complexity: ComplexityLevel | undefined,
    oversight: OversightMode | undefined,
): ContinuationTelemetry {
    return {
        event,
        currentStep,
        reason,
        ...(previousStep !== undefined ? { previousStep } : {}),
        ...(coarsePhase !== undefined ? { coarsePhase } : {}),
        ...(complexity !== undefined ? { complexity } : {}),
        ...(oversight !== undefined ? { oversight } : {}),
    }
}
