/**
 * Read-only enforcement — pure decision function for whether a write-class
 * tool call is permitted in the current pipelineStep.
 *
 * Ported from `luca-mastracode/src/orchestration/read-only-enforcement.ts`,
 * which patched the Mastra harness's workspace factory + permissionRules
 * to disable write/execute tools in `plan`, `discuss`, `triage`, `research`,
 * `review` modes. The Mastra-specific delivery (TOOL_NAME_OVERRIDES for
 * Mastra workspace tool renaming, `harness.workspaceFn` private-field patch,
 * `setState({ permissionRules })` belt-and-suspenders, mode-change
 * subscriptions) does NOT survive the port — those depend on a Mastra
 * runtime being alive and own a delivery model Claude Code does not have.
 *
 * What survives is the ALGORITHM:
 *
 *  - A set of read-only pipeline steps (steps where the agent should
 *    only THINK, not MUTATE).
 *  - A classifier from raw (tool_name, tool_input) to a small write-tool
 *    taxonomy (write-file, edit-file, notebook-edit, mutating-bash).
 *  - A decision function: in a read-only step, block any write-tool call;
 *    otherwise allow.
 *
 * The Claude Code delivery vehicle is a `PreToolUse` hook (Phase E-2,
 * lives in `luca-tools`) that fires on `Write|Edit|NotebookEdit` (and
 * optionally `Bash` for write-side commands), reads `.luca/state.json`,
 * calls `enforceReadOnly()`, and exits 0 (allow) / 2 (block) per Claude
 * Code's hook contract.
 *
 * Design constraints:
 *  - PURE. No I/O. No global state. No filesystem reads.
 *  - INPUT is everything the hook needs to gather and pass in.
 *  - OUTPUT is a verdict object — the caller decides how to surface it.
 *
 * The read-only-stage classification delegates to `coarsePhaseOf()`:
 * every pipelineStep mapped to `PLANNING` or `REVIEWING` is read-only.
 * The single source of truth is `PIPELINE_STEP_TO_COARSE_PHASE` in
 * `state/configs/coarse-phase-map.ts` — there is no separate
 * READ_ONLY_STEPS constant in luca-core because the coarse-phase
 * mapping already encodes the same partition deterministically.
 *
 * Why not piggy-back on the (richer) `isToolAllowed` matrix in
 * `state/helpers/is-tool-allowed.ts`: that matrix is for the full
 * stage-gate hook (which luca-cli already ships as `luca hook stage-gate`)
 * and reasons about FIVE tool categories with phase-specific allow/deny
 * combinations. The read-only-enforcement port has a narrower job: model
 * the mastracode behaviour (block write tools in read-only modes) as a
 * standalone, defense-in-depth hook that can ship via the luca-tools
 * artifact pipeline and run alongside (or in place of) the stage-gate
 * hook in consumer repos. Two surfaces, one source of truth — the matrix
 * answers "what category in what phase", this module answers the
 * specific yes/no for "is this a write call in a read-only step".
 */
import { coarsePhaseOf } from '../state/helpers/coarse-phase-of.ts'
import type { PipelineStep } from '../state/schemas.ts'

/**
 * Tool taxonomy this module recognises. The hook handler classifies the
 * raw Claude Code (tool_name, tool_input) into one of these values; the
 * algorithm gates on the value.
 *
 *  - `write-file`     — `Write` tool (creates / overwrites a file).
 *  - `edit-file`      — `Edit` tool (in-place replacement).
 *  - `notebook-edit`  — `NotebookEdit` tool (Jupyter cell mutation).
 *  - `bash-mutate`    — `Bash` tool with a command the classifier
 *                       determined mutates the filesystem (rm, mv, git
 *                       commit, etc.). The handler may pass this in
 *                       directly; the algorithm doesn't re-classify.
 *  - `other`          — Anything else (Read, Grep, Glob, Task,
 *                       read-only Bash, MCP tools). Always allowed by
 *                       this gate.
 */
export type ReadOnlyToolClass =
    | 'write-file'
    | 'edit-file'
    | 'notebook-edit'
    | 'bash-mutate'
    | 'other'

/**
 * The set of write-class tool tags. Membership = "this tag is gated by
 * read-only enforcement". `other` is the only non-gated value; every
 * other tag means "this is a mutation".
 */
const WRITE_TOOL_CLASSES = new Set<ReadOnlyToolClass>([
    'write-file',
    'edit-file',
    'notebook-edit',
    'bash-mutate',
])

/**
 * Reason codes for an enforcement verdict. Stable strings so callers
 * (hook handler, ledger consumers, telemetry, future tests) can branch
 * on them without parsing free-form `reason` text.
 */
export type ReadOnlyEnforcementReason =
    | 'ok-not-read-only-step'
    | 'ok-not-write-tool'
    | 'blocked-write-in-read-only-step'
    | 'unknown-current-step'

/**
 * Verdict returned by `enforceReadOnly`. The caller turns this into a
 * hook exit code + stderr message; this module makes no assumptions
 * about that delivery channel.
 *
 *  - `allowed: true`  — call may proceed.
 *  - `allowed: false` — call should be blocked; surface `reason` and
 *                       `message` to the user.
 *  - `telemetry`      — optional payload the caller can attach to a
 *                       ledger or telemetry event.
 */
export interface ReadOnlyEnforcementVerdict {
    allowed: boolean
    reason: ReadOnlyEnforcementReason
    /** Human-readable explanation. Safe to print to stderr. */
    message: string
    /** Optional structured payload for ledger/telemetry consumers. */
    telemetry?: ReadOnlyEnforcementTelemetry
}

/**
 * Telemetry payload describing an enforcement decision. The handler may
 * emit (or drop) these via `luca telemetry record`; the algorithm only
 * builds the structure.
 */
export interface ReadOnlyEnforcementTelemetry {
    /** Stable event name a caller can use as the ledger event. */
    event:
        | 'read-only-enforcement-block'
        | 'read-only-enforcement-pass'
    currentStep: string
    toolClass: ReadOnlyToolClass
    /** Concrete Claude Code tool name (e.g. `Write`, `Bash`). */
    toolName?: string
    /** Optional target path / Bash command, surfaced for diagnostics. */
    targetPath?: string
    reason: ReadOnlyEnforcementReason
}

/**
 * Input to `enforceReadOnly`. All fields are required-from-caller data
 * — the hook handler gathers them from the Claude Code harness payload
 * and from `.luca/state.json`.
 *
 *  - `currentStep`     — what `.luca/state.json` says the pipeline is
 *                        in.
 *  - `toolName`        — raw Claude Code tool identifier (`Write`,
 *                        `Edit`, `NotebookEdit`, `Bash`). Used for
 *                        diagnostics + classification fallback.
 *  - `toolClass`       — caller-supplied classification. If omitted,
 *                        the algorithm derives it from `toolName`
 *                        alone (which means `Bash` lands in `other`
 *                        unless the caller pre-classified the
 *                        command). The handler typically pre-classifies
 *                        Bash via a separate command parser.
 *  - `targetPath`      — for write/edit tools, the file_path argument;
 *                        surfaced in diagnostics so the user knows
 *                        WHICH path was blocked.
 */
export interface ReadOnlyEnforcementInput {
    currentStep: string
    toolName?: string
    toolClass?: ReadOnlyToolClass
    targetPath?: string
}

/**
 * Mapping from raw Claude Code tool name to the fallback tool class.
 * The handler may pass an explicit `toolClass` (for Bash, where the
 * raw name alone is insufficient — read-only `ls` vs. mutating `rm`);
 * if the caller leaves it unset, we infer from the name and treat
 * unrecognised names (including `Bash`) as `other` (allow).
 *
 * Exporting the map so the handler can use the same table to avoid
 * drift; not exporting the WRITE_TOOL_CLASSES set because that's an
 * implementation detail of the algorithm.
 */
export const READ_ONLY_TOOL_CLASS_BY_NAME: Readonly<
    Record<string, ReadOnlyToolClass>
> = Object.freeze({
    Write: 'write-file',
    Edit: 'edit-file',
    NotebookEdit: 'notebook-edit',
})

/**
 * Set of pipeline steps where this gate enforces read-only behaviour.
 *
 * Derived from `coarsePhaseOf(step) === 'PLANNING' | 'REVIEWING'` —
 * the canonical mapping in `state/configs/coarse-phase-map.ts`. The
 * mapping is exhaustive across `PipelineStep`, so this list is a
 * deterministic projection, not a separate source of truth.
 *
 * Exported (read-only) so the handler can use it in log messages and
 * tests can assert membership without running the algorithm.
 */
export const READ_ONLY_STEPS: readonly PipelineStep[] = Object.freeze([
    'triage',
    'research',
    'discuss',
    'architect',
    'plan',
    'plan-review',
    'verify',
    'review',
    'learn',
])

const READ_ONLY_STEP_SET = new Set<string>(READ_ONLY_STEPS)

/**
 * Decide whether a tool call should be allowed under the read-only
 * enforcement contract. Pure function — call it from a hook, a CLI, a
 * test, or any other surface; output is identical for identical input.
 *
 * The decision tree:
 *   1. `currentStep` is not a known pipeline step → reject with a
 *      typed reason (state.json is corrupted; the conservative
 *      choice here is to BLOCK, but the hook layer typically
 *      down-grades this to allow via failure-open glue. The
 *      algorithm reports honestly; the caller decides policy).
 *   2. `currentStep` is NOT a read-only step → allow (gate is inert
 *      outside read-only phases).
 *   3. Classify the tool. If not a write-class tool → allow.
 *   4. Otherwise → block.
 *
 * NOTE: this gate does NOT classify Bash commands. The handler must
 * pre-classify (via a Bash command parser shared with the stage-gate
 * hook) and pass the result in via `toolClass`. If the handler doesn't
 * pre-classify, Bash falls through to `other` and the gate becomes a
 * no-op for it — which is the SAFE failure-open default because the
 * stage-gate hook still enforces the matrix-level decision.
 */
export function enforceReadOnly(
    input: ReadOnlyEnforcementInput,
): ReadOnlyEnforcementVerdict {
    const { currentStep, toolName, targetPath } = input

    // Resolve the tool class. If the caller provided one explicitly,
    // trust it (handler did the work of parsing the Bash command etc.).
    // Otherwise fall back to the static name → class map; anything not
    // in the map is `other` and inert.
    const toolClass: ReadOnlyToolClass =
        input.toolClass ??
        (toolName !== undefined
            ? (READ_ONLY_TOOL_CLASS_BY_NAME[toolName] ?? 'other')
            : 'other')

    if (!isKnownPipelineStep(currentStep)) {
        return {
            allowed: false,
            reason: 'unknown-current-step',
            message:
                `read-only-enforcement: current pipelineStep '${currentStep}' is not a known step. ` +
                `state.json may be corrupted or pre-migration; rebuild via 'luca state read'.`,
            telemetry: buildTelemetry(
                'read-only-enforcement-block',
                currentStep,
                toolClass,
                'unknown-current-step',
                toolName,
                targetPath,
            ),
        }
    }

    if (!READ_ONLY_STEP_SET.has(currentStep)) {
        return {
            allowed: true,
            reason: 'ok-not-read-only-step',
            message: `read-only-enforcement: pipelineStep '${currentStep}' is not read-only — allowing.`,
            telemetry: buildTelemetry(
                'read-only-enforcement-pass',
                currentStep,
                toolClass,
                'ok-not-read-only-step',
                toolName,
                targetPath,
            ),
        }
    }

    if (!WRITE_TOOL_CLASSES.has(toolClass)) {
        return {
            allowed: true,
            reason: 'ok-not-write-tool',
            message:
                `read-only-enforcement: ${toolName ?? '(unknown tool)'} is not a write-class tool — allowing.`,
            telemetry: buildTelemetry(
                'read-only-enforcement-pass',
                currentStep,
                toolClass,
                'ok-not-write-tool',
                toolName,
                targetPath,
            ),
        }
    }

    const targetSuffix = targetPath !== undefined ? ` to '${targetPath}'` : ''
    return {
        allowed: false,
        reason: 'blocked-write-in-read-only-step',
        message:
            `read-only-enforcement: ${toolName ?? '(unknown write tool)'} call${targetSuffix} ` +
            `is blocked in pipelineStep='${currentStep}' (read-only). ` +
            `Read-only steps: ${READ_ONLY_STEPS.join(', ')}. ` +
            `Advance the pipeline (e.g. 'luca state advance execute') before issuing write operations.`,
        telemetry: buildTelemetry(
            'read-only-enforcement-block',
            currentStep,
            toolClass,
            'blocked-write-in-read-only-step',
            toolName,
            targetPath,
        ),
    }
}

/**
 * Type guard: is the given string a known PipelineStep? Used to keep
 * the algorithm honest when state.json arrives with a corrupted /
 * pre-migration value.
 *
 * Implementation: we check membership against the union derived from
 * `coarsePhaseOf`'s domain. Calling `coarsePhaseOf` directly with an
 * unknown step is a runtime error (Record access on a missing key
 * returns `undefined` under `noUncheckedIndexedAccess`), so we test
 * by reading the canonical step list from a static set instead.
 *
 * The static set is the union of READ_ONLY_STEPS plus the
 * non-read-only steps. Kept in sync with `PipelineStepValues` via
 * an exhaustive switch the compiler validates if anything goes
 * missing.
 */
function isKnownPipelineStep(step: string): step is PipelineStep {
    return ALL_PIPELINE_STEPS_SET.has(step)
}

// Exhaustiveness guard — if a new PipelineStep is added, the
// switch below will be a compile error until this set is updated.
// Build the set from a typed exhaustive table so renames in the
// schema propagate.
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

// Dev-time guard: derived READ_ONLY_STEPS must agree with the canonical
// coarsePhaseOf mapping. If anyone edits one without the other this
// throws on module load. Keeping the runtime check tiny — O(steps) on
// import once.
for (const step of READ_ONLY_STEPS) {
    const phase = coarsePhaseOf(step)
    if (phase !== 'PLANNING' && phase !== 'REVIEWING') {
        throw new Error(
            `read-only-enforcement: READ_ONLY_STEPS member '${step}' ` +
                `does not map to PLANNING/REVIEWING via coarsePhaseOf (got '${phase}'). ` +
                `Fix the list or the coarse-phase map.`,
        )
    }
}

function buildTelemetry(
    event: ReadOnlyEnforcementTelemetry['event'],
    currentStep: string,
    toolClass: ReadOnlyToolClass,
    reason: ReadOnlyEnforcementReason,
    toolName: string | undefined,
    targetPath: string | undefined,
): ReadOnlyEnforcementTelemetry {
    return {
        event,
        currentStep,
        toolClass,
        reason,
        ...(toolName !== undefined ? { toolName } : {}),
        ...(targetPath !== undefined ? { targetPath } : {}),
    }
}
