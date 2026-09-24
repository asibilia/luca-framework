import { z } from 'zod'

/**
 * The board's view of one run, as the plugin's server keeps it and the side
 * panel reads it. Shared by both runtimes, so it holds only Zod schemas and
 * plain values. Words follow CONTEXT.md: ticket, blocked, gate, red check,
 * fix loop, ticket review, final review, lens, finding, stuck, skipped ticket,
 * limit wait, shadow mode.
 */

/** The plugin id, as in paseo-plugin.json. The engine calls RPCs on it. */
export const PLUGIN_ID = 'luca-board'

/** How often the side panel polls `board.read`. */
export const POLL_MS = 2000

/** How to call the slash command, as shown to people. */
export const RUN_USAGE = '/luca-run <spec number> | demo'

/** The side panel's text when this workspace has no run yet. */
export const EMPTY_BOARD_TEXT =
    'Type /luca-run <spec> in a chat to start a run, or /luca-run demo for a safe practice run.'

/** Fix loops and review rounds are capped at 3. */
export const LOOP_CAP = 3

/** The steps of a ticket, shown as dots on its card. */
export const STEP_NAMES = [
    'tests',
    'red check',
    'code',
    'checks',
    'review',
] as const

/** Refactor tickets skip the first two steps: no new test can fail first. */
export const REFACTOR_SKIPS_STEPS = 2

/** The step index a ticket has when every step is done. */
export const ALL_STEPS_DONE = STEP_NAMES.length

/** Plan usage is yellow from this percent. */
export const USAGE_WARN_FROM = 60

/** Plan usage is red above this percent. */
export const USAGE_HIGH_ABOVE = 85

export const UsageLevelSchema = z.enum(['ok', 'warn', 'high'])

export type UsageLevel = z.infer<typeof UsageLevelSchema>

/**
 * The color level of a plan usage percent: `ok` (green) below 60, `warn`
 * (yellow) from 60 to 85, `high` (red) above 85.
 *
 * @example
 * usageLevel({ percent: 59 }) // 'ok'
 * usageLevel({ percent: 85 }) // 'warn'
 * usageLevel({ percent: 86 }) // 'high'
 */
export const usageLevel = ({ percent }: { percent: number }): UsageLevel => {
    if (percent > USAGE_HIGH_ABOVE) return 'high'
    if (percent >= USAGE_WARN_FROM) return 'warn'
    return 'ok'
}

/** Where a run stands, as one word for the header row and the panel. */
export const RunStatusSchema = z.enum([
    'starting',
    'intake',
    'building',
    'final_review',
    'limit_wait',
    'done',
    'refused',
    'nothing_to_do',
    'stuck',
    'stopped',
    'ended_with_error',
])

export type RunStatus = z.infer<typeof RunStatusSchema>

/** The part of a run's status the journal sets directly. */
export const RunPhaseSchema = z.enum([
    'starting',
    'intake',
    'building',
    'final_review',
    'done',
    'refused',
    'nothing_to_do',
])

export type RunPhase = z.infer<typeof RunPhaseSchema>

export const TicketStageSchema = z.enum([
    'blocked',
    'building',
    'reviewing',
    'stuck',
    'done',
    'skipped',
])

export type TicketStage = z.infer<typeof TicketStageSchema>

export const FindingCountsSchema = z.object({
    blocker: z.number().int().min(0),
    should_fix: z.number().int().min(0),
    nit: z.number().int().min(0),
})

export type FindingCounts = z.infer<typeof FindingCountsSchema>

/**
 * A check whose failure went back to an agent: its fix loop is open. `review`
 * is a ticket review that asked for changes: the next fixer starts a review
 * fix round.
 */
export const OpenCheckSchema = z.enum(['red_check', 'gates', 'review'])

export type OpenCheck = z.infer<typeof OpenCheckSchema>

export const TicketCardSchema = z.object({
    number: z.number().int(),
    title: z.string(),
    refactor: z.boolean(),
    /** Tickets of this run this one waits on. */
    blockers: z.array(z.number().int()),
    /** The engine has begun work on it (its worktree exists). */
    started: z.boolean(),
    stage: TicketStageSchema,
    /**
     * Index into STEP_NAMES of the current step: -1 not started, 5 when every
     * step is done. A stuck or skipped ticket keeps the step it stopped at.
     */
    step: z.number().int().min(-1).max(ALL_STEPS_DONE),
    /** One-word (or two) activity, such as "coding" or "reviewing". */
    activity: z.string(),
    /** The role working on it now, `null` when no agent is. */
    role: z.string().nullable(),
    /** Fix rounds in the current fix loop; back to 0 once its check passes. */
    fix_round: z.number().int().min(0),
    review_round: z.number().int().min(0),
    /** Review fix rounds so far (up to LOOP_CAP): fixes after a review. */
    review_fix_round: z.number().int().min(0),
    /** The check whose failure the next follow-up answers, if any. */
    open_check: OpenCheckSchema.nullable(),
    /** The role whose latest turn failed, until an agent finishes again. */
    failed_turn: z.string().nullable(),
    tests: z
        .object({
            failing: z.number().int().min(0),
            total: z.number().int().min(0),
        })
        .nullable(),
    findings: FindingCountsSchema.nullable(),
    /** Every token the ticket's agents read or wrote, cache reads included. */
    tokens: z.number().min(0),
    /** The same tokens by role. */
    agent_tokens: z.record(z.string(), z.number().min(0)),
    /** What was tried on it so far (failed checks, fix rounds), oldest first. */
    tried: z.array(z.string()),
})

export type TicketCard = z.infer<typeof TicketCardSchema>

/** Stuck work waiting for a one-word reply on the spec issue. */
export const NeedsYouSchema = z.object({
    /** `ticket-<n>` or `final`. */
    key: z.string(),
    ticket: z.number().int().nullable(),
    subject: z.string(),
    reason: z.string(),
    detail: z.string(),
    /** What was tried before it got stuck, oldest first. */
    tried: z.array(z.string()),
    /** The exact replies to post as a comment on the spec issue. */
    replies: z.array(z.string()),
    since: z.string(),
})

export type NeedsYou = z.infer<typeof NeedsYouSchema>

export const LENS_NAMES = [
    'architecture',
    'simplification',
    'security',
    'integration',
    'rules',
] as const

export const LensNameSchema = z.enum(LENS_NAMES)

export type LensName = z.infer<typeof LensNameSchema>

export const LensStateSchema = z.enum([
    'waiting',
    'reviewing',
    'fixing',
    'clean',
])

export type LensState = z.infer<typeof LensStateSchema>

export const LensCardSchema = z.object({
    name: LensNameSchema,
    state: LensStateSchema,
    findings: FindingCountsSchema,
})

export type LensCard = z.infer<typeof LensCardSchema>

export const FinalReviewStateSchema = z.enum([
    'waiting',
    'reviewing',
    'fixing',
    'stuck',
    'passed',
])

export type FinalReviewState = z.infer<typeof FinalReviewStateSchema>

export const FinalReviewSchema = z.object({
    state: FinalReviewStateSchema,
    /** False (drawn dimmed) until every ticket is done or skipped. */
    active: z.boolean(),
    round: z.number().int().min(0),
    fix_round: z.number().int().min(0),
    lenses: z.array(LensCardSchema),
    /** What was tried on it so far, oldest first. */
    tried: z.array(z.string()),
})

export type FinalReview = z.infer<typeof FinalReviewSchema>

/**
 * The plan's usage, from the rate-limit readings in agents' sessions. Each
 * window keeps its latest reading; `null` until one arrives.
 */
export const UsageSchema = z.object({
    five_hour_percent: z.number().nullable(),
    weekly_percent: z.number().nullable(),
    five_hour_level: UsageLevelSchema.nullable(),
    weekly_level: UsageLevelSchema.nullable(),
    /** When the five-hour window resets. */
    resets_at: z.string().nullable(),
    read_at: z.string(),
})

export type Usage = z.infer<typeof UsageSchema>

export const EngineEndedSchema = z.object({
    ok: z.boolean(),
    message: z.string(),
})

export type EngineEnded = z.infer<typeof EngineEndedSchema>

/**
 * The run stopped because going on was unsafe (wrong credentials or plan,
 * a rejected rate limit, overage, ...). Starting it again with the same run
 * id picks the step up again.
 */
export const RunStoppedSchema = z.object({
    reason: z.string(),
    role: z.string().nullable(),
    ticket: z.number().int().nullable(),
    since: z.string(),
})

export type RunStopped = z.infer<typeof RunStoppedSchema>

export const RunInfoSchema = z.object({
    run_id: z.string(),
    /** `null` for a demo run until the engine names its spec. */
    spec_number: z.number().int().nullable(),
    spec_title: z.string().nullable(),
    demo: z.boolean(),
    branch: z.string().nullable(),
    phase: RunPhaseSchema,
    status: RunStatusSchema,
    pr_url: z.string().nullable(),
    pr_number: z.number().int().nullable(),
    /** Why intake refused the run, one line per problem. */
    refusal: z.array(z.string()),
    started_at: z.string(),
    last_time: z.string().nullable(),
    engine_ended: EngineEndedSchema.nullable(),
    /** Set by `run_stopped`, cleared once the engine moves on. */
    stopped: RunStoppedSchema.nullable(),
    log_path: z.string().nullable(),
})

export type RunInfo = z.infer<typeof RunInfoSchema>

/**
 * Jev in shadow mode: how often the engine asked it and what came back. The
 * engine never acts on the answers, so the board only counts them.
 */
export const JevCountsSchema = z.object({
    asked: z.number().int().min(0),
    answered: z.number().int().min(0),
    failed: z.number().int().min(0),
})

export type JevCounts = z.infer<typeof JevCountsSchema>

export const BoardStateSchema = z.object({
    run: RunInfoSchema,
    usage: UsageSchema.nullable(),
    limit_wait: z
        .object({ resets_at: z.string().nullable(), since: z.string() })
        .nullable(),
    needs_you: z.array(NeedsYouSchema),
    tickets: z.array(TicketCardSchema),
    final_review: FinalReviewSchema,
    jev: JevCountsSchema,
    /** Journal records applied so far. */
    event_count: z.number().int().min(0),
    /** The latest thing that happened, in words (for the footer). */
    latest: z.string().nullable(),
})

export type BoardState = z.infer<typeof BoardStateSchema>

/** One run in the panel's run list. */
export const RunSummarySchema = z.object({
    run_id: z.string(),
    spec_number: z.number().int().nullable(),
    spec_title: z.string().nullable(),
    demo: z.boolean(),
    status: RunStatusSchema,
    started_at: z.string(),
    needs_you: z.number().int().min(0),
})

export type RunSummary = z.infer<typeof RunSummarySchema>
