import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { archiveLoose, detectStragglers } from './repo-cleanup.js'

import {
    snapshotWorkingTree,
    computePhaseDiff,
    type PhaseSnapshot,
} from '../analysis/phase-diff.js'
import { MODES, ALL_REGISTERED_MODES } from '../constants/mode-ids.js'
import {
    readLucaState,
    writeLucaState,
    startPhase,
    recordIteration,
    advanceWave,
    completePhase,
    type LucaWorkflowState,
} from '../state/luca-store.js'
import {
    appendLedger,
    archivePriorRun,
    startNewRun,
} from '../state/session-ledger.js'
import { appendTelemetry, type TelemetryKind } from '../state/telemetry.js'
import { readVerificationResult } from '../state/verification-result.js'
import { clampTokens, finiteOrNull } from '../util/numeric.js'
import {
    deriveSlug,
    phasePath,
    planningRoot,
    resolveAvailableSlug,
    ROADMAP_PATH,
    TELEMETRY_PATH,
    TELEMETRY_ARCHIVE_PATH,
    assertValidRunId,
} from '../util/phase-paths.js'
import { tickPhaseTasks } from '../util/plan-checkboxes.js'
import { switchModeRef, contextRefresherRef } from '../util/refs.js'
import { sanitizeForLog, sanitizeForStorage } from '../util/sanitize.js'

const VALID_MODES = ALL_REGISTERED_MODES

/**
 * Pipeline step order and transition map.
 *
 * MANUAL MIRROR: This map defines step transitions (who can come next).
 * It is manually maintained alongside PIPELINE_STEPS_ORDERED in `../pipeline-tui.ts`
 * (the canonical ordered list with display labels). Both lists must stay synchronized:
 * if you add, remove, or rename a step, update BOTH files.
 *
 * Currently these are kept separate because they serve different purposes:
 * - PIPELINE_STEPS_ORDERED (pipeline-tui.ts): ordered list with labels, used for TUI progress display
 * - PIPELINE_ORDER (this file): transition mapping, used for step sequencing/validation
 *
 * Note: A future refactor should consolidate these into a single shared module
 * to eliminate manual synchronization.
 *
 * Related: BARE_TO_NAMESPACED in `../luca-store.ts` — historical migration map
 * for mode ID renames; update separately if IDs change.
 */
export const PIPELINE_ORDER: Record<string, string | undefined> = {
    [MODES.triage]: MODES.research,
    [MODES.research]: MODES.architect,
    [MODES.architect]: MODES.execute,
    [MODES.execute]: MODES.review,
    [MODES.review]: MODES.finalize,
    [MODES.finalize]: undefined,
}

/**
 * Documented backward transitions that bypass the "no backward step" check.
 * - Review → Execute:    iteration loop for MUST-FIX issues (review.md Step 7B)
 * - Finalize → Architect: cross-milestone continuation (finalize.md Step 5)
 * - Finalize → Execute:   gap-detected rework (finalize.md Step 4)
 */
const ALLOWED_BACKWARD_TRANSITIONS: Record<string, Set<string>> = {
    [MODES.review]: new Set([MODES.execute]),
    [MODES.finalize]: new Set([MODES.architect, MODES.execute]),
}

/**
 * Detect stale pipeline state from a previous run. Returns true if
 * the state contains leftover intent or an active (non-idle) pipelineStep
 * that would contaminate a new pipeline run.
 */
function hasStaleState(state: LucaWorkflowState): boolean {
    if (state.pipelineStep && state.pipelineStep !== 'idle') return true
    if (state.intent) return true
    return false
}

// `finiteOrNull`, `clampTokens`, `sanitizeLogMessage` (→ sanitizeForLog), and
// `sanitizeTelemetryValue` (→ sanitizeForStorage) were extracted to
// `../util/numeric.js` and `../util/sanitize.js` so `telemetry.ts` and other
// callers can share the same implementations. Aliases below preserve the
// original local names at all 9 callsites in this file.
const sanitizeLogMessage = sanitizeForLog
const sanitizeTelemetryValue = sanitizeForStorage

// ── Per-action Zod schemas ──────────────────────────────────────────
// Used for runtime validation + type narrowing in the execute handler.
// Actions with no extra fields (read, record-iteration, advance-wave,
// reset-pipeline) don't need a runtime parse — the flat inputSchema
// already validates them via the action enum.

const writeAction = z.object({
    action: z.literal('write'),
    updates: z
        .record(z.string(), z.unknown())
        .describe('State fields to update'),
})

const switchModeAction = z.object({
    action: z.literal('switch-mode'),
    targetMode: z
        .string()
        .describe(
            'Target mode ID to switch to. Must be one of: build, plan, fast, luca:discuss, luca:1-triage, luca:2-research, luca:3-architect, luca:4-execute, luca:5-review, luca:6-finalize'
        ),
    userRequest: z
        .string()
        .optional()
        .describe(
            "Original user request to pass to the target mode. Written to state as 'intent' before switching."
        ),
})

const startPhaseAction = z.object({
    action: z.literal('start-phase'),
    phaseName: z.string().describe('Phase name from ROADMAP.md'),
})

const completePhaseAction = z.object({
    action: z.literal('complete-phase'),
    verificationPassed: z
        .boolean()
        .optional()
        .describe('Whether verification passed'),
    reviewPassed: z.boolean().optional().describe('Whether review passed'),
})

const saveTriageResultsAction = z.object({
    action: z.literal('save-triage-results'),
    intent: z.string().describe('Parsed intent summary'),
    complexity: z
        .enum(['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL'])
        .describe('Classified complexity level'),
    oversight: z
        .enum(['full-auto', 'checkpoint', 'human-in-loop'])
        .describe('Oversight mode'),
    profile: z.string().optional().describe('Execution profile'),
    affectedAreas: z
        .array(z.string())
        .optional()
        .describe('List of affected packages/modules'),
    skipResearch: z
        .boolean()
        .optional()
        .describe('Skip research phase for trivial/simple tasks'),
})

const savePlanArtifactsAction = z.object({
    action: z.literal('save-plan-artifacts'),
    planFile: z
        .string()
        .optional()
        .describe(
            'Path to plan file. Defaults to .planning/phases/<slug>/PLAN.md when slug is set, else .planning/PLAN.md.'
        ),
    roadmapFile: z
        .string()
        .optional()
        .describe(
            'Path to roadmap file. Always at .planning/ROADMAP.md (cross-phase).'
        ),
})

export const saveReviewResultsAction = z.object({
    action: z.literal('save-review-results'),
    iterationPlan: z
        .array(z.string())
        .optional()
        .describe('Focused list of fixes for next execute iteration'),
    reviewIteration: z.number().optional().describe('Review iteration number'),
    /**
     * Review perspectives covered this iteration (e.g. ['architecture',
     * 'security', 'simplification', 'dx']). Stored in `meta.perspectives`
     * on the emitted `review.iteration` telemetry. Each entry capped at
     * 64 chars + regex; array capped at 10 to prevent meta-field bloat.
     */
    perspectives: z
        .array(
            z
                .string()
                .max(64)
                .regex(
                    /^[a-z0-9_-]+$/,
                    'perspective must be lowercase alnum + _ -'
                )
        )
        .max(10)
        .optional(),
    /** Optional severity counts for richer telemetry. */
    mustFixCount: z.number().int().nonnegative().optional(),
    shouldFixCount: z.number().int().nonnegative().optional(),
    noteCount: z.number().int().nonnegative().optional(),
    /** Reviewer verdict — surfaces in meta.verdict for convergence analysis. */
    verdict: z
        .enum(['approved', 'changes_requested', 'issues_found'])
        .optional(),
})

const EMPTY_PHASE_CATEGORIES = [
    'docs-only-in-muninn',
    'investigation-confirmed-no-change-needed',
    'config-only-no-tracked-files',
    'dependency-bump-via-lockfile-only',
    'no-op-by-design',
] as const

const justifyEmptyPhaseAction = z.object({
    action: z.literal('justify-empty-phase'),
    phase: z
        .string()
        .describe('Phase name (must match the in-progress phase).'),
    category: z
        .enum(EMPTY_PHASE_CATEGORIES)
        .describe(
            'Why this phase legitimately has no diff. Used to unblock the empty-phase guard on complete-phase.'
        ),
    reasoning: z
        .string()
        .min(20, 'Reasoning must be at least 20 characters')
        .describe(
            'Concrete explanation of why no code changed. Surfaces in the postmortem report for human review.'
        ),
})

const RE_ENTER_TARGETS = [MODES.execute, MODES.review] as const

const reEnterPipelineAction = z.object({
    action: z.literal('re-enter-pipeline'),
    targetMode: z
        .enum(RE_ENTER_TARGETS)
        .describe(
            'Pipeline mode to re-enter at. Only execute or review — cannot re-enter at triage/research/architect.'
        ),
    reason: z
        .string()
        .describe(
            'Why the pipeline is being re-entered (stored in state as reEntryReason).'
        ),
})

// archive-loose has no extra fields — the action discriminator alone is
// sufficient. Defined for completeness and future-proofing in case the
// action gains options (e.g. dry-run / explicit slug override).
const archiveLooseAction = z.object({
    action: z.literal('archive-loose'),
})

export const recordSubagentAction = z.object({
    action: z.literal('record-subagent'),
    event: z.enum(['invoke', 'complete']),
    role: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[^\r\n\t]+$/, 'role must not contain CR/LF/tab'),
    correlationId: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[^\r\n\t]+$/, 'correlationId must not contain CR/LF/tab'),
    inputTokens: z.number().int().nonnegative().nullable().optional(),
    outputTokens: z.number().int().nonnegative().nullable().optional(),
    durationMs: z.number().nullable().optional(),
    success: z.boolean().nullable().optional(),
    model: z
        .string()
        .max(64)
        .regex(/^[^\r\n\t]+$/, 'model must not contain CR/LF/tab')
        .nullable()
        .optional(),
    /**
     * Failure-mode disambiguation for `complete` events. Lets callers
     * distinguish crashed / killed / timed-out / partial-parse cases
     * instead of conflating all as `success: false`. Stored in
     * `meta.outcome` on emit (NOT top-level — keeps the v:1 TelemetryRecord
     * schema additive-safe).
     */
    outcome: z
        .enum([
            'completed',
            'completed_no_usage',
            'completed_partial_parse',
            'crashed',
            'killed',
            'timeout',
            'cancelled_by_user',
        ])
        .nullable()
        .optional(),
})

/**
 * Self-reported retroactive cancellation event.
 *
 * Emitted by the orchestrator (parent agent or user-facing build mode) when
 * it detects a hung subagent and kills it manually — fills the diagnostic
 * gap where a user-cancelled subagent looks identical to a pipeline stall
 * in the JSONL telemetry (only a long mode.start→mode.end delta with no
 * matching subagent.complete record).
 *
 * Emits a `subagent.cancelled` TelemetryRecord with:
 *   - meta.role, meta.correlationId — pair to the original `subagent.invoke`
 *   - meta.cancelReason — short human-readable reason (sanitized to telemetry)
 *   - meta.outcome: 'cancelled_by_user' — fixed sentinel for aggregator filtering
 *   - durationMs (top-level) — partial elapsed ms from invoke to kill
 *
 * NOTE: there is no `subagent.complete` for cancelled calls. Aggregators must
 * treat `subagent.invoke` + `subagent.cancelled` as a complete pair instead
 * of an orphan invoke.
 */
export const cancelSubagentAction = z.object({
    action: z.literal('cancel-subagent'),
    role: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[^\r\n\t]+$/, 'role must not contain CR/LF/tab'),
    correlationId: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[^\r\n\t]+$/, 'correlationId must not contain CR/LF/tab'),
    /**
     * Short human-readable reason for the kill (e.g. "stuck >10m without
     * any tool calls", "user requested cancel via TUI hotkey"). Free-form,
     * sanitized for storage. Max 512 chars to match query field convention.
     */
    cancelReason: z
        .string()
        .min(1)
        .max(512)
        .regex(/^[^\r\n\t]+$/, 'cancelReason must not contain CR/LF/tab'),
    /** Partial elapsed duration from invoke to kill. Travels in `overrides`. */
    partialDurationMs: z.number().nonnegative().nullable().optional(),
})

export const recordRecallAction = z.object({
    action: z.literal('record-recall'),
    /**
     * Caller's recall query string (free-form). Capped at 512 chars and
     * stripped of CR/LF/tab before storage to defuse log-injection
     * (CWE-117); telemetry.ts then `sanitizeLogMessage`s the return
     * message a second time.
     */
    query: z
        .string()
        .min(1)
        .max(512)
        .regex(/^[^\r\n\t]+$/, 'query must not contain CR/LF/tab'),
    /** Number of matches returned by muninn_recall (null when unknown). */
    resultCount: z.number().int().nonnegative().nullable().optional(),
    /**
     * Number of matches with trust=verified. Clamped against `resultCount`
     * server-side — if `resultCount` is null, `verifiedCount` is forced null
     * to prevent meaningless ratios in the aggregator.
     */
    verifiedCount: z.number().int().nonnegative().nullable().optional(),
    /** Vault scope (e.g. 'luca-framework'). */
    vault: z
        .string()
        .max(64)
        .regex(/^[a-z0-9_-]+$/, 'vault must be lowercase alnum + _ -')
        .nullable()
        .optional(),
    /**
     * Recall mode (semantic/recent/balanced/deep). Stored in
     * `meta.callerMode` to avoid colliding with the top-level
     * `oversight` mode resolved server-side.
     */
    mode: z
        .string()
        .max(64)
        .regex(/^[a-z0-9:_-]+$/, 'mode must be lowercase alnum + :_-')
        .nullable()
        .optional(),
    /** Recall round-trip duration. Travels in `overrides` (top-level field). */
    durationMs: z.number().nullable().optional(),
})

/**
 * Registry of per-action Zod schemas — the source of truth for the
 * dual-layer drift detector test (`dual-layer-schema-drift.test.ts`).
 *
 * When adding a new per-action schema with constraint-bearing fields
 * (regex / min / max) that must be mirrored in `workflowStateInputSchema`,
 * register it here so the drift detector iterates over it automatically.
 * The list of constrained per-action schemas is small (currently 3); the
 * remaining actions in `WORKFLOW_STATE_ACTIONS` either take no extra fields
 * or have no constrained string fields requiring flat-schema mirroring.
 *
 * @internal — exported for testing only.
 */
export const WORKFLOW_ACTION_SCHEMAS: Record<
    string,
    z.ZodObject<z.ZodRawShape>
> = {
    'record-subagent': recordSubagentAction,
    'record-recall': recordRecallAction,
    'cancel-subagent': cancelSubagentAction,
    'save-review-results': saveReviewResultsAction,
}

// ── All valid actions (exported for createScopedTool) ──────────────
export const WORKFLOW_STATE_ACTIONS = [
    'read',
    'write',
    'switch-mode',
    'start-phase',
    'record-iteration',
    'advance-wave',
    'complete-phase',
    'justify-empty-phase',
    'save-triage-results',
    'save-plan-artifacts',
    'save-review-results',
    'reset-pipeline',
    're-enter-pipeline',
    'archive-loose',
    'record-subagent',
    'record-recall',
    'cancel-subagent',
] as const

export type WorkflowStateAction = (typeof WORKFLOW_STATE_ACTIONS)[number]

/**
 * Flat z.object schema for the Anthropic API.
 *
 * z.discriminatedUnion produces { oneOf: [...] } without a top-level "type",
 * which Anthropic's API rejects. This flat schema generates a valid
 * { "type": "object", "properties": { ... } } JSON Schema.
 *
 * Action-specific fields are optional here; the execute handler validates
 * required fields per-action using the strict per-action schemas above.
 */
export const workflowStateInputSchema = z.object({
    action: z
        .enum(WORKFLOW_STATE_ACTIONS)
        .describe(
            "Which action to perform. read: check state before acting. switch-mode: only after current mode's work is complete. start-phase/complete-phase: bracket each phase. advance-wave: only after checks pass. archive-loose: migrate root stragglers under .planning/ into the active phase dir (refused if pipeline lock is held by another live session)."
        ),

    // write
    updates: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("State fields to update (required for 'write' action)."),

    // switch-mode
    targetMode: z
        .string()
        .optional()
        .describe(
            "Target mode ID (required for 'switch-mode'). One of: build, plan, fast, luca:discuss, luca:1-triage, luca:2-research, luca:3-architect, luca:4-execute, luca:5-review, luca:6-finalize"
        ),
    userRequest: z
        .string()
        .optional()
        .describe(
            "Original user request to pass to target mode (switch-mode only). Written to state as 'intent'."
        ),

    // start-phase
    phaseName: z
        .string()
        .optional()
        .describe("Phase name from ROADMAP.md (required for 'start-phase')."),

    // complete-phase
    verificationPassed: z
        .boolean()
        .optional()
        .describe('Whether verification passed (complete-phase only).'),
    reviewPassed: z
        .boolean()
        .optional()
        .describe('Whether review passed (complete-phase only).'),

    // save-triage-results
    intent: z
        .string()
        .optional()
        .describe(
            "Parsed intent summary (required for 'save-triage-results')."
        ),
    complexity: z
        .enum(['TRIVIAL', 'SIMPLE', 'MODERATE', 'COMPLEX', 'CRITICAL'])
        .optional()
        .describe(
            "Classified complexity level (required for 'save-triage-results')."
        ),
    oversight: z
        .enum(['full-auto', 'checkpoint', 'human-in-loop'])
        .optional()
        .describe("Oversight mode (required for 'save-triage-results')."),
    profile: z
        .string()
        .optional()
        .describe('Execution profile (save-triage-results only).'),
    affectedAreas: z
        .array(z.string())
        .optional()
        .describe(
            'List of affected packages/modules (save-triage-results only).'
        ),
    skipResearch: z
        .boolean()
        .optional()
        .describe(
            'Skip research phase for trivial/simple tasks (save-triage-results only).'
        ),

    // save-plan-artifacts
    planFile: z
        .string()
        .optional()
        .describe(
            'Path to plan file. Defaults to .planning/phases/<slug>/PLAN.md when slug is set, else .planning/PLAN.md.'
        ),
    roadmapFile: z
        .string()
        .optional()
        .describe(
            'Path to roadmap file. Always at .planning/ROADMAP.md (cross-phase).'
        ),

    // save-review-results
    iterationPlan: z
        .array(z.string())
        .optional()
        .describe(
            'Focused list of fixes for next execute iteration (save-review-results only).'
        ),
    reviewIteration: z
        .number()
        .optional()
        .describe('Review iteration number (save-review-results only).'),
    perspectives: z
        .array(
            z
                .string()
                .max(64)
                .regex(
                    /^[a-z0-9_-]+$/,
                    'perspective must be lowercase alnum + _ -'
                )
        )
        .max(10)
        .optional()
        .describe(
            'Review perspectives covered (save-review-results only). Surfaces in review.iteration telemetry meta.'
        ),
    mustFixCount: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
            'Count of must-fix findings (save-review-results only). Meta-only.'
        ),
    shouldFixCount: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
            'Count of should-fix findings (save-review-results only). Meta-only.'
        ),
    noteCount: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
            'Count of note findings (save-review-results only). Meta-only.'
        ),
    verdict: z
        .enum(['approved', 'changes_requested', 'issues_found'])
        .optional()
        .describe('Reviewer verdict (save-review-results only). Meta-only.'),

    // re-enter-pipeline
    reason: z
        .string()
        .optional()
        .describe(
            "Why the pipeline is being re-entered (required for 're-enter-pipeline'). Stored in state as reEntryReason."
        ),

    // justify-empty-phase
    phase: z
        .string()
        .optional()
        .describe(
            "Phase name (required for 'justify-empty-phase'). Must match the in-progress phase."
        ),
    category: z
        .enum(EMPTY_PHASE_CATEGORIES)
        .optional()
        .describe(
            "Empty-phase category (required for 'justify-empty-phase'). One of: docs-only-in-muninn | investigation-confirmed-no-change-needed | config-only-no-tracked-files | dependency-bump-via-lockfile-only | no-op-by-design."
        ),
    reasoning: z
        .string()
        .optional()
        .describe(
            "Concrete reasoning for why no code changed (required for 'justify-empty-phase'). Surfaces in postmortem report."
        ),

    // record-subagent
    event: z
        .enum(['invoke', 'complete'])
        .optional()
        .describe(
            "Subagent lifecycle event (required for 'record-subagent'). 'invoke' emits subagent.invoke; 'complete' emits subagent.complete."
        ),
    role: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[^\r\n\t]+$/, 'role must not contain CR/LF/tab')
        .optional()
        .describe(
            "Subagent role identifier, e.g. 'executor', 'reviewer' (required for 'record-subagent')."
        ),
    correlationId: z
        .string()
        .min(1)
        .max(128)
        .regex(/^[^\r\n\t]+$/, 'correlationId must not contain CR/LF/tab')
        .optional()
        .describe(
            "Correlation ID pairing invoke/complete events for the same subagent call (required for 'record-subagent')."
        ),
    inputTokens: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .optional()
        .describe(
            'Input token count for the subagent call (record-subagent only). Clamped to safe integer or null.'
        ),
    outputTokens: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .optional()
        .describe(
            'Output token count for the subagent call (record-subagent only). Clamped to safe integer or null.'
        ),
    durationMs: z
        .number()
        .nullable()
        .optional()
        .describe(
            'Duration in milliseconds for the subagent call (record-subagent only, typically on complete events).'
        ),
    success: z
        .boolean()
        .nullable()
        .optional()
        .describe(
            'Whether the subagent call succeeded (record-subagent only, typically on complete events).'
        ),
    model: z
        .string()
        .max(64)
        .regex(/^[^\r\n\t]+$/, 'model must not contain CR/LF/tab')
        .nullable()
        .optional()
        .describe(
            'Model identifier used by the subagent (record-subagent only).'
        ),
    outcome: z
        .enum([
            'completed',
            'completed_no_usage',
            'completed_partial_parse',
            'crashed',
            'killed',
            'timeout',
            'cancelled_by_user',
        ])
        .nullable()
        .optional()
        .describe(
            'Failure-mode disambiguation for record-subagent complete events. Stored in meta.outcome.'
        ),

    // record-recall
    query: z
        .string()
        .max(512)
        .regex(/^[^\r\n\t]+$/, 'query must not contain CR/LF/tab')
        .optional()
        .describe(
            "Recall query string (required for 'record-recall'). Capped at 512 chars; CR/LF/tab rejected."
        ),
    resultCount: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .optional()
        .describe(
            'Number of matches returned by muninn_recall (record-recall only).'
        ),
    verifiedCount: z
        .number()
        .int()
        .nonnegative()
        .nullable()
        .optional()
        .describe(
            'Verified-tier subset of resultCount (record-recall only). Clamped server-side.'
        ),
    vault: z
        .string()
        .max(64)
        .regex(/^[a-z0-9_-]+$/, 'vault must be lowercase alnum + _ -')
        .nullable()
        .optional()
        .describe('Vault scope (record-recall only).'),
    // `mode` is the recall mode (semantic/recent/balanced/deep) — distinct
    // from `targetMode` (switch-mode) and the pipeline `oversight` mode.
    mode: z
        .string()
        .max(64)
        .regex(/^[a-z0-9:_-]+$/, 'mode must be lowercase alnum + :_-')
        .nullable()
        .optional()
        .describe(
            'Recall mode: semantic | recent | balanced | deep (record-recall only). Stored as meta.callerMode.'
        ),
    // `durationMs` is already declared above for record-subagent; reused
    // for record-recall — same field, different action semantics. The
    // per-action schema is the source of truth.

    // cancel-subagent
    cancelReason: z
        .string()
        .min(1)
        .max(512)
        .regex(/^[^\r\n\t]+$/, 'cancelReason must not contain CR/LF/tab')
        .optional()
        .describe(
            "Short human-readable reason for cancellation (required for 'cancel-subagent'). Sanitized for storage; max 512 chars."
        ),
    partialDurationMs: z
        .number()
        .nonnegative()
        .nullable()
        .optional()
        .describe(
            'Partial elapsed ms from invoke to kill (cancel-subagent only). Travels in telemetry overrides as top-level durationMs.'
        ),
})

export type WorkflowStateInput = z.infer<typeof workflowStateInputSchema>

// ── Helper: strict parse an action's input ─────────────────────────
function parseAction<S extends z.ZodTypeAny>(
    schema: S,
    input: Record<string, unknown>
): z.infer<S> {
    const result = schema.safeParse(input)
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ')
        throw new ActionValidationError(input.action as string, issues)
    }
    return result.data
}

class ActionValidationError extends Error {
    constructor(action: string, details: string) {
        super(`Invalid input for action '${action}': ${details}`)
        this.name = 'ActionValidationError'
    }
}

// ── Tool definition ────────────────────────────────────────────────

export const workflowStateTool = createTool({
    id: 'workflow-state',
    description:
        "Read/write Luca workflow state (.planning/luca-state.json). Tracks pipeline progress, phase status, and mode transitions. Pipeline order: triage→research→architect→execute→review→finalize. Do NOT call switch-mode without completing current mode's requirements.",
    inputSchema: workflowStateInputSchema,
    execute: async (inputData) => {
        try {
            const raw = inputData as Record<string, unknown>

            switch (inputData.action) {
                case 'read': {
                    const state = readLucaState()
                    return {
                        success: true,
                        message: 'State read successfully',
                        state,
                    }
                }
                case 'write': {
                    const { updates } = parseAction(writeAction, raw)
                    const merged = writeLucaState(updates)
                    return {
                        success: true,
                        message: `Updated state: ${Object.keys(updates).join(', ')}`,
                        state: merged,
                    }
                }
                case 'switch-mode': {
                    const { targetMode, userRequest } = parseAction(
                        switchModeAction,
                        raw
                    )
                    if (!VALID_MODES.includes(targetMode)) {
                        return {
                            success: false,
                            message: `Invalid mode "${targetMode}". Valid modes: ${VALID_MODES.join(', ')}`,
                        }
                    }
                    if (!switchModeRef.current) {
                        return {
                            success: false,
                            message:
                                'switchMode not available — harness not initialized',
                        }
                    }

                    // --- Stale state detection on pipeline entry ---
                    const prevState = readLucaState()
                    if (
                        targetMode === MODES.triage &&
                        hasStaleState(prevState)
                    ) {
                        return {
                            success: false,
                            message: [
                                `Stale pipeline state detected from a previous run.`,
                                prevState.intent
                                    ? `Previous intent: "${prevState.intent}"`
                                    : null,
                                prevState.pipelineStep &&
                                prevState.pipelineStep !== 'idle'
                                    ? `Previous pipeline step: "${prevState.pipelineStep}"`
                                    : null,
                                ``,
                                `Before starting a new pipeline, ask the user (via ask_user) whether to:`,
                                `(1) Clear the old state and start fresh`,
                                `(2) Resume the previous pipeline`,
                                ``,
                                `If they choose to clear, call workflowState(action: "reset-pipeline") first, then retry this switch-mode call.`,
                            ]
                                .filter(Boolean)
                                .join('\n'),
                            staleState: {
                                intent: prevState.intent,
                                pipelineStep: prevState.pipelineStep,
                                complexity: prevState.complexity,
                                startedAt: prevState.startedAt,
                            },
                        }
                    }

                    // --- Pipeline ordering enforcement ---
                    const PIPELINE_MODES = new Set(Object.keys(PIPELINE_ORDER))
                    const currentStep = prevState.pipelineStep

                    if (
                        currentStep &&
                        PIPELINE_MODES.has(currentStep) &&
                        PIPELINE_MODES.has(targetMode)
                    ) {
                        const expectedNext = PIPELINE_ORDER[currentStep]

                        if (targetMode !== expectedNext) {
                            // Allow triage → architect skip when skipResearch is set
                            if (
                                currentStep === MODES.triage &&
                                targetMode === MODES.architect &&
                                prevState.skipResearch
                            ) {
                                // Skip-ahead allowed
                            } else {
                                const pipelineSequence =
                                    Object.keys(PIPELINE_ORDER)
                                const currentIdx =
                                    pipelineSequence.indexOf(currentStep)
                                const targetIdx =
                                    pipelineSequence.indexOf(targetMode)

                                if (targetIdx <= currentIdx) {
                                    // Allow documented backward transitions (iteration loops, cross-milestone continuation)
                                    const allowedBackward =
                                        ALLOWED_BACKWARD_TRANSITIONS[
                                            currentStep
                                        ]
                                    if (!allowedBackward?.has(targetMode)) {
                                        return {
                                            success: false,
                                            message: `Pipeline ordering violation: cannot go backward from "${currentStep}" to "${targetMode}". The correct next step is "${expectedNext}". Call workflowState(action: "switch-mode", targetMode: "${expectedNext}") instead.`,
                                        }
                                    }
                                    // Backward transition allowed — fall through
                                } else {
                                    return {
                                        success: false,
                                        message: `Pipeline ordering violation: cannot skip from "${currentStep}" to "${targetMode}". The correct next step is "${expectedNext}". Call workflowState(action: "switch-mode", targetMode: "${expectedNext}") instead.`,
                                    }
                                }
                            }
                        }
                    }

                    try {
                        const stateUpdates: Record<string, unknown> = {
                            pipelineStep: targetMode,
                            nextMode: targetMode,
                        }
                        if (userRequest) {
                            stateUpdates.intent = userRequest
                        }
                        // Capture pre-mutation context for mode.end telemetry.
                        // Must read BEFORE writeLucaState() — after mutation,
                        // readLucaState() reflects new pipelineStep/phase/slug/wave.
                        const priorMode = prevState.pipelineStep ?? null
                        const priorPhase = prevState.currentPhaseName ?? null
                        const priorSlug = prevState.currentPhaseSlug ?? null
                        const priorWave = prevState.currentWave ?? null
                        const priorModeStartedAt =
                            prevState.currentModeStartedAt as string | undefined
                        writeLucaState(stateUpdates)
                        appendLedger('mode-transition', {
                            from: priorMode,
                            to: targetMode,
                        })
                        await switchModeRef.current(targetMode)
                        // Notify context refresher of mode change AFTER successful switch
                        // so it doesn't get stuck in the wrong mode if switch fails.
                        contextRefresherRef.current?.setMode(targetMode)

                        // Persist currentModeStartedAt AFTER successful switch.
                        // Intentional two-write design: the first write (pipelineStep/
                        // nextMode above) runs BEFORE switchModeRef.current() so the new
                        // mode reads correct state on entry. This second write runs AFTER
                        // a successful switch — a failed switch (throw at line above) skips
                        // this block entirely, ensuring currentModeStartedAt is never set
                        // without a matching mode.start telemetry record.
                        // Trade-off: a process crash between the two writes leaves pipelineStep
                        // updated but currentModeStartedAt stale — the next mode.end will emit
                        // durationMs: null (no prior timestamp), which is safe and recoverable.
                        const modeStartedAt = new Date().toISOString()
                        const postSwitchUpdates: Record<string, unknown> = {
                            currentModeStartedAt: modeStartedAt,
                        }
                        // Stamp reviewStartedAt on review-mode entry so
                        // save-review-results can compute durationMs. Cleared
                        // on reset-pipeline + re-enter-pipeline (review-loop
                        // resumes via re-enter-pipeline, not switch-mode).
                        if (targetMode === MODES.review) {
                            postSwitchUpdates.reviewStartedAt = modeStartedAt
                        }
                        writeLucaState(postSwitchUpdates)

                        // Telemetry: outer pipeline loop durations.
                        // appendTelemetry is fail-safe — never throws.
                        // mode.end closes the outgoing mode; mode.start opens the new one.
                        const modeDurationMs = priorModeStartedAt
                            ? finiteOrNull(
                                  Date.now() -
                                      new Date(priorModeStartedAt).getTime()
                              )
                            : null
                        // `mode.end` overrides phase/slug/wave with pre-mutation
                        // values because writeLucaState above only mutated
                        // pipelineStep/nextMode/intent — complexity, oversight, runId
                        // are NOT mutated by switch-mode and safely flow through
                        // readLucaState() inside buildTelemetryRecord.
                        appendTelemetry(
                            'mode.end',
                            { from: priorMode },
                            {
                                phase: priorPhase,
                                slug: priorSlug,
                                wave: priorWave,
                                durationMs: modeDurationMs,
                            }
                        )
                        appendTelemetry('mode.start', { to: targetMode })

                        return {
                            success: true,
                            message: `Switched to "${targetMode}" mode.`,
                        }
                    } catch (err) {
                        return {
                            success: false,
                            message: `Failed to switch mode: ${err instanceof Error ? err.message : String(err)}`,
                            error: err instanceof Error ? err.stack : undefined,
                        }
                    }
                }
                case 'start-phase': {
                    const { phaseName } = parseAction(startPhaseAction, raw)
                    const phaseState = startPhase({ name: phaseName })
                    appendLedger('phase-start', { phase: phaseName })

                    // Snapshot working tree as proof-of-work baseline.
                    const snapshot: PhaseSnapshot =
                        snapshotWorkingTree(phaseName)
                    writeLucaState({ currentPhaseStartSnapshot: snapshot })
                    appendLedger('phase-snapshot', {
                        phase: phaseName,
                        headSha: snapshot.headSha,
                        dirtyFileCount: snapshot.dirtyFiles.length,
                        gitAvailable: snapshot.gitAvailable,
                    })

                    // Telemetry: emit phase.start + wave.start.
                    // State is now post-mutation (wave 1, new phase, new slug)
                    // → no overrides needed; appendTelemetry reads state itself.
                    // appendTelemetry never throws — see telemetry.ts contract.
                    appendTelemetry('phase.start')
                    appendTelemetry('wave.start')

                    return {
                        success: true,
                        message: `Started phase "${phaseName}" (wave 1, iteration 0)`,
                        state: phaseState,
                    }
                }
                case 'record-iteration': {
                    const iterState = recordIteration()
                    appendLedger('iteration-complete', {
                        phase: iterState.currentPhaseName,
                        wave: iterState.currentWave,
                        iteration: iterState.currentIteration,
                        budgetExceeded: iterState.budgetExceeded ?? false,
                    })
                    let iterMsg = `Recorded iteration ${iterState.currentIteration} for phase "${iterState.currentPhaseName}"`
                    if (iterState.budgetExceeded) {
                        iterMsg += ` ⚠ Budget limit exceeded (maxChecksFixIterations). Consider advancing to the next wave or reporting remaining failures.`
                        appendLedger('budget-exceeded', {
                            type: 'iteration',
                            iteration: iterState.currentIteration,
                            phase: iterState.currentPhaseName,
                        })
                    }
                    return {
                        success: true,
                        message: iterMsg,
                        state: iterState,
                    }
                }
                case 'advance-wave': {
                    // Guard: refuse to advance unless the current wave has a
                    // verification result on file. Prevents waves from being
                    // closed silently without proof of work.
                    const preWaveState = readLucaState()
                    const currentWave = preWaveState.currentWave ?? 1
                    const verification = readVerificationResult()
                    if (!verification || verification.wave !== currentWave) {
                        appendLedger('wave-advance-blocked', {
                            phase: preWaveState.currentPhaseName,
                            wave: currentWave,
                            reason: 'no verification-result for current wave',
                        })
                        return {
                            success: false,
                            code: 'WAVE_ADVANCE_NO_VERIFICATION',
                            message: `Cannot advance wave: no verification-result.json for wave ${currentWave}. Call verificationResult(action: "write", ...) before advance-wave.`,
                        }
                    }

                    // Capture pre-mutation context BEFORE advanceWave().
                    // Producer uses `.find(r => r.name === currentPhaseName)`;
                    // consumer MUST match — never `.at(-1)` (resumed phases
                    // mutate in place, not at end of phaseResults).
                    const priorPhase = preWaveState.currentPhaseName ?? null
                    const priorSlug = preWaveState.currentPhaseSlug ?? null
                    const priorWaveNum = preWaveState.currentWave ?? null
                    const priorEntry = preWaveState.phaseResults?.find(
                        (r) => r.name === priorPhase
                    )
                    const priorWaveStartedAt = priorEntry?.waveStartedAt
                    // Guard against NaN from malformed/corrupted timestamps —
                    // see finiteOrNull JSDoc.
                    const priorDurationMs = priorWaveStartedAt
                        ? finiteOrNull(
                              Date.now() -
                                  new Date(priorWaveStartedAt).getTime()
                          )
                        : null

                    const waveState = advanceWave()
                    appendLedger('wave-advance', {
                        phase: waveState.currentPhaseName,
                        wave: waveState.currentWave,
                        budgetExceeded: waveState.budgetExceeded ?? false,
                    })

                    // Telemetry: emit wave.end for the closing wave, then
                    // wave.start for the new wave. wave.end MUST use overrides
                    // because readLucaState() now returns the post-mutation
                    // state (new wave number).
                    // appendTelemetry never throws — see telemetry.ts contract.
                    appendTelemetry(
                        'wave.end',
                        {},
                        {
                            wave: priorWaveNum,
                            phase: priorPhase,
                            slug: priorSlug,
                            durationMs: priorDurationMs,
                        }
                    )
                    appendTelemetry('wave.start')

                    let waveMsg = `Advanced to wave ${waveState.currentWave} in phase "${waveState.currentPhaseName}"`
                    if (waveState.budgetExceeded) {
                        waveMsg += ` ⚠ Budget limit exceeded (maxPhases). Consider completing the phase or reporting remaining work.`
                        appendLedger('budget-exceeded', {
                            type: 'wave',
                            wave: waveState.currentWave,
                            phase: waveState.currentPhaseName,
                        })
                    }
                    return {
                        success: true,
                        message: waveMsg,
                        state: waveState,
                    }
                }
                case 'complete-phase': {
                    const { verificationPassed, reviewPassed } = parseAction(
                        completePhaseAction,
                        raw
                    )

                    // ── Guard 1: diff-based phase proof ─────────────────────
                    const preState = readLucaState()
                    const phaseName = preState.currentPhaseName ?? '<unknown>'
                    const startSnapshot =
                        preState.currentPhaseStartSnapshot ?? null
                    const diff = computePhaseDiff(startSnapshot)
                    appendLedger('phase-diff-summary', {
                        phase: phaseName,
                        filesChanged: diff.filesChanged,
                        commitsAdded: diff.commitsAdded,
                        isEmpty: diff.isEmpty,
                        indeterminate: diff.indeterminate,
                    })

                    if (diff.isEmpty) {
                        const justifications =
                            preState.emptyPhaseJustifications ?? {}
                        const j = justifications[phaseName]
                        if (!j) {
                            return {
                                success: false,
                                code: 'EMPTY_PHASE_BLOCKED',
                                message: `Phase "${phaseName}" has zero file changes and zero commits. Either (a) call workflowState(action: "justify-empty-phase", phase: "${phaseName}", category: <category>, reasoning: "<why>") if this is intentional, or (b) re-enter execute mode to do the work.`,
                            }
                        }
                    }

                    // ── Guard 2: verification result must exist for current wave ──
                    const verification = readVerificationResult()
                    const currentWave = preState.currentWave ?? 1
                    if (
                        verificationPassed !== false &&
                        (!verification ||
                            verification.wave !== currentWave ||
                            verification.status !== 'PASS')
                    ) {
                        return {
                            success: false,
                            code: 'PHASE_COMPLETE_NO_VERIFICATION',
                            message: `Phase "${phaseName}" cannot be completed: no PASS verification-result.json for wave ${currentWave}. Call verificationResult(action: "write", ...) with a PASS verdict before complete-phase, or pass verificationPassed: false to record a failed completion.`,
                        }
                    }

                    // ── Guard 3: cross-phase stragglers under .planning/ ──
                    // The PR description and changeset for #220 commit to
                    // BLOCKING when root stragglers are present, so callers
                    // cannot proceed to finalize with legacy artifacts at the
                    // root. Returns a structured error with the straggler list
                    // and a runnable suggestion (PR #222 review).
                    //
                    // Skipped on `verificationPassed === false` so failed
                    // completions still record cleanly without spurious
                    // straggler errors layered on top.
                    if (verificationPassed !== false) {
                        try {
                            const { rootStragglers, unknownRootDirs } =
                                detectStragglers()
                            if (
                                rootStragglers.length > 0 ||
                                unknownRootDirs.length > 0
                            ) {
                                return {
                                    success: false,
                                    code: 'PHASE_COMPLETE_STRAGGLERS_AT_ROOT',
                                    message: `Phase "${phaseName}" cannot be completed: ${rootStragglers.length} straggler file(s) and ${unknownRootDirs.length} unknown dir(s) at .planning/ root. Run workflowState({action:"archive-loose"}) to migrate stragglers into the active phase dir, then re-run complete-phase. (Unknown dirs must be cleaned up manually.)`,
                                    stragglers: {
                                        files: rootStragglers,
                                        unknownDirs: unknownRootDirs,
                                    },
                                }
                            }
                        } catch {
                            // detectStragglers is best-effort: a scan glitch
                            // should not permanently block phase completion.
                            // Fall through to completePhase().
                        }
                    }

                    // Capture pre-mutation telemetry context BEFORE completePhase().
                    // `preState` was read at the top of this case (~L708) as
                    // the diff-based phase-proof snapshot — reuse it here.
                    // completePhase() will mutate currentPhaseName (→ next phase
                    // or undefined) and reset currentWave to 1 — so reading state
                    // after the mutation would tag records with the WRONG phase/wave.
                    const tPriorPhase = preState.currentPhaseName ?? null
                    const tPriorSlug = preState.currentPhaseSlug ?? null
                    const tPriorWave = preState.currentWave ?? null
                    const tPriorEntry = preState.phaseResults?.find(
                        (r) => r.name === tPriorPhase
                    )
                    const tPriorWaveStartedAt = tPriorEntry?.waveStartedAt
                    const tPriorPhaseStartedAt = tPriorEntry?.startedAt

                    const phaseResult = completePhase({
                        verificationPassed,
                        reviewPassed,
                    })

                    // Clear snapshot now that the phase is closed.
                    writeLucaState({ currentPhaseStartSnapshot: undefined })

                    appendLedger('phase-complete', {
                        phase: phaseName,
                        verificationPassed: verificationPassed ?? null,
                        reviewPassed: reviewPassed ?? null,
                        filesChanged: diff.filesChanged.length,
                        commitsAdded: diff.commitsAdded.length,
                    })

                    // Telemetry: emit final wave.end + phase.end with pre-mutation context.
                    // appendTelemetry never throws — see telemetry.ts contract.
                    {
                        const now = Date.now()
                        appendTelemetry(
                            'wave.end',
                            {},
                            {
                                wave: tPriorWave,
                                phase: tPriorPhase,
                                slug: tPriorSlug,
                                // Guard against NaN from malformed timestamps
                                // (see finiteOrNull JSDoc).
                                durationMs: tPriorWaveStartedAt
                                    ? finiteOrNull(
                                          now -
                                              new Date(
                                                  tPriorWaveStartedAt
                                              ).getTime()
                                      )
                                    : null,
                            }
                        )
                        appendTelemetry(
                            'phase.end',
                            {},
                            {
                                wave: tPriorWave,
                                phase: tPriorPhase,
                                slug: tPriorSlug,
                                // Guard against NaN from malformed timestamps
                                // (see finiteOrNull JSDoc).
                                durationMs: tPriorPhaseStartedAt
                                    ? finiteOrNull(
                                          now -
                                              new Date(
                                                  tPriorPhaseStartedAt
                                              ).getTime()
                                      )
                                    : null,
                            }
                        )
                    }

                    // ── Advisory: tick PLAN.md checkboxes for this phase ──
                    // Runs AFTER all three guards (diff + verification +
                    // stragglers) have passed AND the review pass has
                    // confirmed completion. We gate on `reviewPassed ===
                    // true` (not `!== false`) so the Execute-side
                    // complete-phase call — which runs BEFORE Review hands
                    // back — does NOT tick prematurely. If Review comes
                    // back MUST-FIX, the phase reopens and PLAN.md stays
                    // unticked. Finalize re-invokes complete-phase with
                    // `reviewPassed: true` once Review has approved, which
                    // is when the tick actually happens. Failures (file
                    // missing, heading mismatch, write error) are advisory
                    // only and never block phase completion (PR #222 review).
                    let planTickResult:
                        | {
                              success: boolean
                              tickedCount: number
                              alreadyTickedCount: number
                              tickedLines: number[]
                              planFile: string
                              reason?: string
                          }
                        | undefined
                    try {
                        const planFile =
                            preState.planFile ??
                            phasePath('PLAN.md', preState.currentPhaseSlug)
                        if (
                            verificationPassed !== false &&
                            reviewPassed === true
                        ) {
                            const result = tickPhaseTasks(planFile, phaseName)
                            planTickResult = {
                                success: result.success,
                                tickedCount: result.tickedCount,
                                alreadyTickedCount: result.alreadyTickedCount,
                                tickedLines: result.tickedLines,
                                planFile: result.planFile,
                                reason: result.reason,
                            }
                            appendLedger('plan-tick-result', {
                                phase: phaseName,
                                planFile: result.planFile,
                                success: result.success,
                                tickedCount: result.tickedCount,
                                alreadyTickedCount: result.alreadyTickedCount,
                                reason: result.reason ?? null,
                            })
                        }
                    } catch {
                        // Best-effort advisory; never fail complete-phase.
                    }

                    // Stragglers are now blocked at Guard 3 above; the success
                    // path here implies a clean root.
                    return {
                        success: true,
                        message: `Completed phase "${phaseName}" (${diff.filesChanged.length} files changed, ${diff.commitsAdded.length} commits)`,
                        state: phaseResult,
                        planTickResult,
                    }
                }
                case 'save-triage-results': {
                    const triage = parseAction(saveTriageResultsAction, raw)
                    const updates: Partial<LucaWorkflowState> = {
                        intent: triage.intent,
                        complexity: triage.complexity,
                        oversight: triage.oversight,
                        profile: triage.profile ?? 'balanced',
                        affectedAreas: triage.affectedAreas,
                        skipResearch: triage.skipResearch,
                    }

                    // Derive session-scoped phase slug if not already set
                    // (re-entry idempotency). Slug is IMMUTABLE: once
                    // persisted by triage, never recomputed. See #220.
                    const current = readLucaState()
                    if (!current.currentPhaseSlug && triage.intent) {
                        const baseSlug = deriveSlug(triage.intent)
                        updates.currentPhaseSlug =
                            resolveAvailableSlug(baseSlug)
                    }

                    const triageState = writeLucaState(updates)
                    appendLedger('triage-complete', {
                        intent: triage.intent,
                        complexity: triage.complexity,
                        oversight: triage.oversight,
                    })
                    return {
                        success: true,
                        message: `Triage saved: complexity=${triage.complexity}, oversight=${triage.oversight}${triage.skipResearch ? ' (research skipped)' : ''}`,
                        state: triageState,
                    }
                }
                case 'save-plan-artifacts': {
                    const { planFile: rawPlan, roadmapFile: rawRoadmap } =
                        parseAction(savePlanArtifactsAction, raw)

                    // Per-phase scope per #220: PLAN.md, CONTEXT.md, RESEARCH.md
                    // resolve under phaseDir(slug); ROADMAP.md is always root.
                    // Read slug at exec time; absent slug falls back to root
                    // (see `phasePath` semantics).
                    const slug = readLucaState().currentPhaseSlug
                    const toRepoRelative = (abs: string): string =>
                        relative(process.cwd(), abs)

                    // planFile resolution:
                    //  - omitted              → phasePath('PLAN.md', slug)
                    //  - bare filename ("X")  → phasePath('X', slug)
                    //  - explicit .planning/* → preserved as-is (caller knows)
                    //  - any other path       → preserved as-is
                    let planFile: string
                    if (rawPlan === undefined) {
                        planFile = toRepoRelative(phasePath('PLAN.md', slug))
                    } else if (
                        !rawPlan.includes('/') &&
                        !rawPlan.includes('\\')
                    ) {
                        planFile = toRepoRelative(phasePath(rawPlan, slug))
                    } else {
                        planFile = rawPlan
                    }

                    // roadmapFile resolution:
                    //  - omitted              → ROADMAP_PATH() (root)
                    //  - bare filename        → planningRoot()/<filename>
                    //  - explicit path        → preserved as-is
                    let roadmapFile: string
                    if (rawRoadmap === undefined) {
                        roadmapFile = toRepoRelative(ROADMAP_PATH())
                    } else if (
                        !rawRoadmap.includes('/') &&
                        !rawRoadmap.includes('\\')
                    ) {
                        roadmapFile = toRepoRelative(
                            join(planningRoot(), rawRoadmap)
                        )
                    } else {
                        roadmapFile = rawRoadmap
                    }

                    const planState = writeLucaState({
                        planFile,
                        roadmapFile,
                    })
                    appendLedger('plan-artifacts-saved', {
                        planFile,
                        roadmapFile,
                    })
                    return {
                        success: true,
                        message: `Plan artifacts saved: planFile=${planFile}, roadmapFile=${roadmapFile}`,
                        state: planState,
                    }
                }
                case 'save-review-results': {
                    const {
                        iterationPlan,
                        reviewIteration,
                        perspectives,
                        mustFixCount,
                        shouldFixCount,
                        noteCount,
                        verdict,
                    } = parseAction(saveReviewResultsAction, raw)
                    // Capture priorIteration BEFORE writeLucaState() so the
                    // telemetry record reports the iteration whose findings
                    // are being saved — not the post-increment value.
                    const preReviewState = readLucaState()
                    const priorIteration =
                        (preReviewState.reviewIteration as
                            | number
                            | undefined) ?? 0
                    const reviewStartedAt = preReviewState.reviewStartedAt as
                        | string
                        | undefined
                    const reviewState = writeLucaState({
                        iterationPlan: iterationPlan ?? undefined,
                        reviewIteration: reviewIteration ?? undefined,
                    })
                    appendLedger('review-results-saved', {
                        iterationPlan,
                        reviewIteration,
                    })
                    // Telemetry: emit review.iteration with severity counts +
                    // perspectives + durationMs (computed from reviewStartedAt
                    // when present; null fallback otherwise).
                    // appendTelemetry is fail-safe — never throws.
                    const reviewDurationMs = reviewStartedAt
                        ? finiteOrNull(
                              Date.now() - new Date(reviewStartedAt).getTime()
                          )
                        : null
                    appendTelemetry(
                        'review.iteration',
                        {
                            iteration: reviewIteration ?? priorIteration,
                            verdict: verdict ?? null,
                            mustFixCount: mustFixCount ?? null,
                            shouldFixCount: shouldFixCount ?? null,
                            noteCount: noteCount ?? null,
                            perspectives: perspectives ?? null,
                        },
                        { durationMs: reviewDurationMs }
                    )
                    return {
                        success: true,
                        message: `Review results saved${reviewIteration != null ? ` (iteration ${reviewIteration})` : ''}${iterationPlan?.length ? `, ${iterationPlan.length} fixes planned` : ''}`,
                        state: reviewState,
                    }
                }
                case 'justify-empty-phase': {
                    const { phase, category, reasoning } = parseAction(
                        justifyEmptyPhaseAction,
                        raw
                    )
                    const justState = readLucaState()
                    const currentPhaseName = justState.currentPhaseName
                    if (!currentPhaseName) {
                        return {
                            success: false,
                            code: 'NO_PHASE_IN_PROGRESS',
                            message: `Cannot justify empty phase: no phase is currently in progress. Call workflowState(action: "start-phase", ...) first.`,
                        }
                    }
                    if (phase !== currentPhaseName) {
                        return {
                            success: false,
                            code: 'PHASE_MISMATCH',
                            message: `Cannot justify empty phase: provided phase "${phase}" does not match the in-progress phase "${currentPhaseName}". Justifications can only be recorded for the active phase.`,
                        }
                    }
                    const existing = justState.emptyPhaseJustifications ?? {}
                    const merged = {
                        ...existing,
                        [phase]: {
                            category,
                            reasoning,
                            at: new Date().toISOString(),
                        },
                    }
                    const updatedState = writeLucaState({
                        emptyPhaseJustifications: merged,
                    })
                    appendLedger('phase-empty-justification', {
                        phase,
                        category,
                        reasoning,
                    })
                    return {
                        success: true,
                        message: `Recorded empty-phase justification for "${phase}" (category: ${category}). complete-phase will now accept this phase.`,
                        state: updatedState,
                    }
                }
                case 'reset-pipeline': {
                    // Archive the prior run's ledger artifacts BEFORE wiping
                    // state, so we don't lose audit trail when starting fresh.
                    const priorRunId = readLucaState().runId as
                        | string
                        | undefined
                    if (priorRunId) {
                        archivePriorRun(priorRunId)
                        // Telemetry janitor — best-effort archive of the prior
                        // run's JSONL into .planning/telemetry/archive/. Never
                        // throws: a corrupted runId, missing file, EACCES, or
                        // cross-device rename all drop to a sanitized warn so
                        // reset-pipeline can complete its mutation regardless.
                        try {
                            assertValidRunId(priorRunId)
                            const src = TELEMETRY_PATH(priorRunId)
                            const dest = TELEMETRY_ARCHIVE_PATH(priorRunId)
                            if (existsSync(src)) {
                                mkdirSync(dirname(dest), { recursive: true })
                                renameSync(src, dest)
                            }
                        } catch (err) {
                            console.warn(
                                `[telemetry-janitor] skipped archival: ${sanitizeLogMessage(err)}`
                            )
                        }
                    }
                    const freshState = writeLucaState({
                        pipelineStep: 'idle',
                        // Triage output — stale intent is the #1 cause of session hijack
                        intent: undefined,
                        complexity: undefined,
                        oversight: undefined,
                        affectedAreas: undefined,
                        profile: undefined,
                        skipResearch: undefined,
                        // Pipeline progress
                        currentPhase: 0,
                        totalPhases: 0,
                        phaseSubStep: undefined,
                        currentPhaseName: undefined,
                        currentWave: 1,
                        currentIteration: 0,
                        nextMode: undefined,
                        budgetExceeded: false,
                        planFile: undefined,
                        roadmapFile: undefined,
                        reviewIteration: undefined,
                        // Session metadata
                        sessionId: undefined,
                        startedAt: undefined,
                        // Mode-transition telemetry — clear so a new run's
                        // first switch-mode emits mode.end with durationMs=null
                        // instead of bleeding the prior run's mode duration.
                        currentModeStartedAt: undefined,
                        // Review-iteration telemetry — same rationale as
                        // currentModeStartedAt: prevent cross-run duration bleed.
                        reviewStartedAt: undefined,
                        assignedTodos: undefined,
                        phaseResults: undefined,
                        // Phase-diff snapshots (Step 2 of the postmortem plan)
                        currentPhaseStartSnapshot: undefined,
                        // Empty-phase justifications — must clear so prior-run
                        // justifications can't unblock complete-phase in a new run
                        emptyPhaseJustifications: undefined,
                        // Run identity — clear so startNewRun mints a fresh ID
                        runId: undefined,
                        // Phase slug — clear so the next save-triage-results
                        // re-derives a fresh slug from the new intent. Otherwise
                        // the stale slug short-circuits the
                        // `if (!current.currentPhaseSlug && triage.intent)`
                        // guard and the new session writes into the prior
                        // session's phases/<old-slug>/ tree (#220 review).
                        // archivePriorRun above runs first, so it can still
                        // resolve the prior slug for archival routing.
                        currentPhaseSlug: undefined,
                    })
                    const newRunId = startNewRun()
                    appendLedger('pipeline-reset', {
                        priorRunId: priorRunId ?? null,
                        newRunId,
                    })
                    return {
                        success: true,
                        message: `Pipeline reset to idle state (run ${newRunId})`,
                        state: { ...freshState, runId: newRunId },
                    }
                }
                case 're-enter-pipeline': {
                    const { targetMode: reEntryTarget, reason: reEntryReason } =
                        parseAction(reEnterPipelineAction, raw)
                    if (!switchModeRef.current) {
                        return {
                            success: false,
                            message:
                                'switchMode not available — harness not initialized',
                        }
                    }

                    // Preserve existing state, update pipeline position and reset review counters
                    const reEntryUpdates: Record<string, unknown> = {
                        pipelineStep: reEntryTarget,
                        nextMode: reEntryTarget,
                        reEntryReason,
                        reviewIteration: 0,
                        budgetExceeded: false,
                    }
                    // Stamp reviewStartedAt on review re-entry so the next
                    // save-review-results call computes durationMs correctly.
                    // Clear it when re-entering execute (review-loop cycled back).
                    if (reEntryTarget === MODES.review) {
                        reEntryUpdates.reviewStartedAt =
                            new Date().toISOString()
                    } else {
                        reEntryUpdates.reviewStartedAt = undefined
                    }
                    const reEntryState = writeLucaState(reEntryUpdates)
                    appendLedger('pipeline-re-entered', {
                        targetMode: reEntryTarget,
                        reason: reEntryReason,
                    })

                    try {
                        await switchModeRef.current(reEntryTarget)
                        // Notify context refresher AFTER successful switch so it doesn't
                        // get stuck in the wrong mode if switch fails.
                        contextRefresherRef.current?.setMode(reEntryTarget)
                        return {
                            success: true,
                            message: `Pipeline re-entered at "${reEntryTarget}". Reason: ${reEntryReason}`,
                            state: reEntryState,
                        }
                    } catch (err) {
                        return {
                            success: false,
                            message: `Re-entered state but mode switch failed: ${err instanceof Error ? err.message : String(err)}`,
                        }
                    }
                }
                case 'archive-loose': {
                    // Validate the action shape (no extra fields). Keeps
                    // future option additions cheap and gives a precise
                    // ActionValidationError on misuse.
                    parseAction(archiveLooseAction, raw)

                    // Delegate to repo-cleanup's archiveLoose() which
                    // performs the full guard set:
                    //   1. Refuses if .luca-lock.json is held by another
                    //      live PID (own PID is fine).
                    //   2. Refuses if currentPhaseSlug is not set (cannot
                    //      determine target phase directory).
                    //   3. Skips files whose target already exists.
                    try {
                        const { archived, skipped } = archiveLoose()
                        appendLedger('archive-loose', {
                            archivedCount: archived.length,
                            skippedCount: skipped.length,
                        })
                        // Three outcomes (PR #222 review):
                        //   1. archived > 0          → migration progressed.
                        //   2. archived = 0, skipped > 0 → migration is
                        //      INCOMPLETE: every candidate was skipped
                        //      because its target already existed (or
                        //      rename failed). Return success:false so
                        //      Finalize doesn't treat this as remediation
                        //      and `complete-phase` will keep blocking
                        //      until the operator resolves manually.
                        //   3. archived = 0, skipped = 0 → genuinely
                        //      clean; no stragglers found.
                        if (archived.length === 0 && skipped.length > 0) {
                            return {
                                success: false,
                                code: 'ARCHIVE_LOOSE_SKIPPED_ONLY',
                                message: `No files migrated — all ${skipped.length} root straggler(s) were skipped (target already exists or rename failed). Resolve manually before re-running.`,
                                archived,
                                skipped,
                            }
                        }
                        const summary =
                            archived.length === 0
                                ? 'No root stragglers found — nothing to archive.'
                                : `Archived ${archived.length} file(s) into the active phase dir${skipped.length > 0 ? ` (${skipped.length} skipped)` : ''}.`
                        return {
                            success: true,
                            message: summary,
                            archived,
                            skipped,
                        }
                    } catch (err) {
                        return {
                            success: false,
                            error:
                                err instanceof Error
                                    ? err.message
                                    : String(err),
                        }
                    }
                }
                case 'record-subagent': {
                    const parsed = recordSubagentAction.safeParse(raw)
                    if (!parsed.success) {
                        throw new ActionValidationError(
                            'record-subagent',
                            parsed.error.issues.map((i) => i.message).join('; ')
                        )
                    }
                    const {
                        event,
                        role,
                        correlationId,
                        inputTokens,
                        outputTokens,
                        durationMs,
                        success,
                        model,
                    } = parsed.data
                    const kind: TelemetryKind =
                        event === 'invoke'
                            ? 'subagent.invoke'
                            : 'subagent.complete'
                    appendTelemetry(
                        kind,
                        {
                            role,
                            correlationId,
                            inputTokens: clampTokens(inputTokens),
                            outputTokens: clampTokens(outputTokens),
                            success: success ?? null,
                            model: model ?? null,
                            outcome: parsed.data.outcome ?? null,
                        },
                        { durationMs: finiteOrNull(durationMs) }
                    )
                    return {
                        success: true,
                        message: `Telemetry emitted: ${kind} (role=${role}, correlationId=${correlationId})`,
                    }
                }
                case 'record-recall': {
                    const parsed = recordRecallAction.safeParse(raw)
                    if (!parsed.success) {
                        throw new ActionValidationError(
                            'record-recall',
                            parsed.error.issues.map((i) => i.message).join('; ')
                        )
                    }
                    const {
                        query,
                        resultCount,
                        verifiedCount,
                        vault,
                        mode: callerMode,
                        durationMs,
                    } = parsed.data
                    // Clamp verifiedCount.
                    // - null-propagate when resultCount is null (no total → ratio
                    //   undefined)
                    // - null-propagate when verifiedCount itself is null/undefined
                    //   so aggregators can distinguish "unknown / not measured"
                    //   from "zero verified" (`?? 0` would bias verified-tier
                    //   hit-rate stats by collapsing both signals to 0).
                    // - else cap at resultCount so an over-reported value can't
                    //   poison aggregate stats.
                    const clampedVerified =
                        resultCount == null
                            ? null
                            : verifiedCount == null
                              ? null
                              : Math.min(verifiedCount, resultCount)
                    // Dispatch hit vs miss by resultCount. Null counts (caller
                    // didn't measure) default to miss — aggregator can ignore.
                    const kind: TelemetryKind =
                        (resultCount ?? 0) > 0 ? 'recall.hit' : 'recall.miss'
                    appendTelemetry(
                        kind,
                        {
                            // Preserve full query up to schema .max(512); only
                            // strip CR/LF/tab. sanitizeLogMessage's 200-char cap
                            // would silently truncate telemetry storage below
                            // the schema-allowed size.
                            query: sanitizeTelemetryValue(query),
                            resultCount: resultCount ?? null,
                            verifiedCount: clampedVerified,
                            vault: vault ?? null,
                            // user-supplied recall mode lives in meta.callerMode
                            // to avoid colliding with the pipeline-level mode
                            // resolved server-side from luca-state.json.
                            callerMode: callerMode ?? null,
                        },
                        { durationMs: finiteOrNull(durationMs) }
                    )
                    return {
                        success: true,
                        message: `Telemetry emitted: ${kind} (query="${sanitizeLogMessage(query)}", resultCount=${resultCount ?? 'null'})`,
                    }
                }
                case 'cancel-subagent': {
                    const parsed = cancelSubagentAction.safeParse(raw)
                    if (!parsed.success) {
                        throw new ActionValidationError(
                            'cancel-subagent',
                            parsed.error.issues.map((i) => i.message).join('; ')
                        )
                    }
                    const {
                        role,
                        correlationId,
                        cancelReason,
                        partialDurationMs,
                    } = parsed.data
                    appendTelemetry(
                        'subagent.cancelled',
                        {
                            role,
                            correlationId,
                            // Preserve cancelReason up to schema .max(512); only
                            // strip CR/LF/tab. Same rationale as `query` in
                            // record-recall — sanitizeLogMessage's 200-char cap
                            // would silently truncate telemetry storage.
                            cancelReason: sanitizeTelemetryValue(cancelReason),
                            // Fixed sentinel — aggregators filter on
                            // outcome === 'cancelled_by_user' to surface
                            // user-cancelled hangs without needing to
                            // correlate orphan invoke/complete pairs.
                            outcome: 'cancelled_by_user',
                            // Cancelled calls have no matching subagent.complete,
                            // so success is explicitly false to keep the
                            // {success,outcome} pair consistent with the
                            // per-action recordSubagentAction contract.
                            success: false,
                        },
                        { durationMs: finiteOrNull(partialDurationMs) }
                    )
                    return {
                        success: true,
                        message: `Telemetry emitted: subagent.cancelled (role=${role}, correlationId=${correlationId}, reason="${sanitizeLogMessage(cancelReason)}")`,
                    }
                }
                default: {
                    return {
                        success: false,
                        message: `Unknown action: "${inputData.action}"`,
                    }
                }
            }
        } catch (err) {
            if (err instanceof ActionValidationError) {
                return { success: false, message: err.message }
            }
            throw err
        }
    },
})
