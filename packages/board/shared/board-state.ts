/**
 * The board's view of one run, as the plugin's server keeps it and the side
 * panel reads it. Shared by both runtimes, so it holds only Zod schemas and
 * plain values. Words follow GLOSSARY.md: ticket, blocked, gate, red check,
 * fix loop, ticket review, final review, lens, finding, stuck, skipped ticket,
 * limit wait, shadow mode.
 *
 * The pieces are in modules by responsibility, all re-exported from here:
 * `board-state-ticket.ts` (a ticket's card and its steps),
 * `board-state-run.ts` (the run, its status, its budget, what needs you),
 * `board-state-review.ts` (the final review), `board-state-usage.ts` (plan
 * usage) and `board-state-counts.ts` (what is only counted). This module
 * holds the plugin's constants and the whole `BoardState`.
 */
import { z } from 'zod'

import {
    JevCountsSchema,
    MemoryCountsSchema,
    MessageCountsSchema,
    NO_MEMORY,
} from './board-state-counts'
import { FinalReviewSchema } from './board-state-review'
import {
    DEFAULT_CONFIDENCE_BAR,
    DEFAULT_RUN_BUDGET_TOKENS,
    NeedsYouSchema,
    PersonTicketSchema,
    RunInfoSchema,
} from './board-state-run'
import { CurrentStepSchema, TicketCardSchema } from './board-state-ticket'
import { PlanUsedSchema, USAGE_LABEL, UsageSchema } from './board-state-usage'

export * from './board-state-counts'
export * from './board-state-live'
export * from './board-state-review'
export * from './board-state-run'
export * from './board-state-ticket'
export * from './board-state-usage'

/** The plugin id, as in paseo-plugin.json. The engine calls RPCs on it. */
export const PLUGIN_ID = 'luca-board'

/** How often the side panel polls `board.read`. */
export const POLL_MS = 2000

/** How to call the slash command, as shown to people. */
export const RUN_USAGE = '/luca-run <spec number> | demo | resume <run id>'

/** The side panel's text when this workspace has no run yet. */
export const EMPTY_BOARD_TEXT =
    'Type /luca-run <spec> in a chat to start a run, or /luca-run demo for a safe practice run.'

/** Fix loops and review rounds are capped at 3. */
export const LOOP_CAP = 3

export const BoardStateSchema = z.object({
    run: RunInfoSchema,
    /**
     * The open tickets left out for a person (#499), by number. Defaulted,
     * so an older board state still parses.
     */
    for_a_person: z.array(PersonTicketSchema).default([]),
    usage: UsageSchema.nullable(),
    /** What `usage` is, in words. Defaulted, so an older board state still parses. */
    usage_label: z.string().default(USAGE_LABEL),
    /**
     * The run's exact tokens: input, output, and cache-creation tokens over
     * every agent turn's models, subagents included (an older journal's
     * turn counts its main loop's). Cache reads are left out. Defaulted, so
     * an older board state still parses.
     */
    run_tokens: z.number().min(0).default(0),
    /**
     * The tokens the run may use before it is stuck (#435): one full run
     * budget, plus one more for each `retry` the owner gave it. Defaulted,
     * so an older board state still parses.
     */
    run_budget_tokens: z.number().min(0).default(DEFAULT_RUN_BUDGET_TOKENS),
    /** One full run budget: the engine config's, else the default. */
    run_budget_each: z.number().min(0).default(DEFAULT_RUN_BUDGET_TOKENS),
    /**
     * The engine config's `models.confidence_bar` (#630): the decision
     * model is sharp at or over it. Defaulted, so an older board state
     * still parses.
     */
    confidence_bar: z.number().min(0).max(1).default(DEFAULT_CONFIDENCE_BAR),
    /** The plan limit was hit; the engine waits and then carries on. */
    limit_wait: z
        .object({
            /** When the wait ends: the reset time, or when the engine wakes. */
            resets_at: z.string().nullable(),
            /** The window that was hit, in words; `null` when not known. */
            window: z.string().nullable(),
            since: z.string(),
        })
        .nullable(),
    /**
     * The run paused at a usage line: the account's window was at or over
     * the line. It carries on when the window resets, or once the line is
     * raised. Defaulted, so a board state from before it still parses.
     */
    usage_line_wait: z
        .object({
            /** The window, in words: `weekly` or `five-hour`. */
            window: z.string(),
            /** The line, in percent. */
            line: z.number(),
            /** How full the window was, in percent. */
            percent: z.number(),
            /** When the window resets. */
            resets_at: z.string(),
            since: z.string(),
        })
        .nullable()
        .default(null),
    /** How much of the plan the whole run used, per window. */
    run_plan_used: z.array(PlanUsedSchema),
    needs_you: z.array(NeedsYouSchema),
    tickets: z.array(TicketCardSchema),
    final_review: FinalReviewSchema,
    jev: JevCountsSchema,
    /** Defaulted, so a board state from before messages still parses. */
    messages: MessageCountsSchema.default({
        sent: 0,
        refused: 0,
        delivered: 0,
    }),
    /** Defaulted, so a board state from before memory still parses. */
    memory: MemoryCountsSchema.default(NO_MEMORY),
    /**
     * Times another process changed the shared `.git` during an agent's
     * turn. Never the agent's doing, so only counted. Defaulted, so a board
     * state from before it still parses.
     */
    shared_git_changed: z.number().int().min(0).default(0),
    /**
     * The steps running now that belong to no ticket (the run's own, the
     * final review's, the learner's), by the engine's key, oldest first.
     * Defaulted, so a board state from before it still parses.
     */
    run_steps: z
        .array(CurrentStepSchema.extend({ key: z.string() }))
        .default([]),
    /** The newest of `run_steps`, `null` when none runs. */
    current_step: CurrentStepSchema.nullable().default(null),
    /** Journal records applied so far. */
    event_count: z.number().int().min(0),
    /** The latest thing that happened, in words (for the footer). */
    latest: z.string().nullable(),
    /**
     * When `latest` happened (its record's time), so the footer can say how
     * long ago. Defaulted, so a board state from before it still parses.
     */
    latest_at: z.string().nullable().default(null),
})

export type BoardState = z.infer<typeof BoardStateSchema>

/**
 * Whether the run has a final review to show: not when it ended with
 * nothing to do or intake refused it, as there is nothing to review.
 *
 * @example
 * showsFinalReview({ state }) // false for a nothing-to-do run
 */
export const showsFinalReview = ({ state }: { state: BoardState }): boolean =>
    state.run.phase !== 'nothing_to_do' && state.run.phase !== 'refused'
