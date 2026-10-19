/**
 * A ticket's card in the board's state: its steps and stage, its findings,
 * the check that is open, the step the engine is in, and the card itself.
 */
import { z } from 'zod'

import { PlanUsedSchema } from './board-state-usage'

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

/**
 * What a ticket is really doing (#549): `building` its first test-writer and
 * implementer pass, `reviewing` only while a reviewer works, `testing` the red
 * check or the checks, `fixing` any fix round, `joining` the run branch and
 * the checks there. Every older stage is still one, so a stored board state
 * from before still parses.
 */
export const TicketStageSchema = z.enum([
    'blocked',
    'building',
    'reviewing',
    'testing',
    'fixing',
    'joining',
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

/**
 * What the engine is doing right now for a ticket or the run, from its
 * `step_started`, such as "running the baseline tests"; `since` is that
 * record's time. Cleared by the step's `step_ended`.
 */
export const CurrentStepSchema = z.object({
    text: z.string(),
    since: z.string(),
})

export type CurrentStep = z.infer<typeof CurrentStepSchema>

/**
 * A time span in words: seconds under a minute, then minutes and seconds,
 * then hours and minutes.
 *
 * @example
 * elapsedText({ ms: 125_000 }) // '2m 5s'
 * elapsedText({ ms: 3_790_000 }) // '1h 3m'
 */
export const elapsedText = ({ ms }: { ms: number }): string => {
    const seconds = Math.max(0, Math.floor(ms / 1000))
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
}

/**
 * The current step in words, with how long it has been running.
 *
 * @example
 * currentStepText({
 *     step: { text: 'running the checks', since: '2026-09-23T12:00:00.000Z' },
 *     now: Date.parse('2026-09-23T12:02:05.000Z'),
 * }) // 'running the checks (2m 5s)'
 */
export const currentStepText = ({
    step,
    now,
}: {
    step: CurrentStep
    now: number
}): string =>
    `${step.text} (${elapsedText({ ms: now - Date.parse(step.since) })})`

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
    /**
     * The engine's step on it now, `null` between steps. Defaulted, so a
     * board state from before it still parses.
     */
    current_step: CurrentStepSchema.nullable().default(null),
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
    /**
     * Its own baseline's test counts, kept so a ticket that reuses this one's
     * baseline (`baseline_reused`) gets them after `tests` has moved on.
     * Defaulted, so a board state from before it still parses.
     */
    baseline_tests: z
        .object({
            failing: z.number().int().min(0),
            total: z.number().int().min(0),
        })
        .nullable()
        .default(null),
    findings: FindingCountsSchema.nullable(),
    /** Every token the ticket's agents read or wrote, cache reads included. */
    tokens: z.number().min(0),
    /** The same tokens by role. */
    agent_tokens: z.record(z.string(), z.number().min(0)),
    /** What was tried on it so far (failed checks, fix rounds), oldest first. */
    tried: z.array(z.string()),
    /** How much of the plan the ticket used, per window; empty until known. */
    plan_used: z.array(PlanUsedSchema),
})

export type TicketCard = z.infer<typeof TicketCardSchema>
