/**
 * The board's vocabulary for the owner's replies and stuck work, the final
 * review, memory, and the scheduler's steps.
 */
import { z } from 'zod'

import { FindingCountsSchema } from './board-vocabulary-shapes'

import { WaitForSchema } from '../shared/board-state'

export const REVIEW_VOCABULARY = {
    /** The owner's reply on the spec issue, read by the engine (#366). */
    reply_received: z.looseObject({
        /** `ship` is only for a stuck final review. */
        word: z.enum(['retry', 'skip', 'stop', 'ship']),
        ticket: z.number().int().nullable().optional(),
    }),
    /** A reply the engine couldn't use; it answered why on the spec issue. */
    reply_ignored: z.looseObject({
        /** `no_ticket_named`, `not_stuck`, `nothing_stuck`, `ship_needs_final_review`, ... */
        reason: z.string(),
    }),
    /** How the engine took a `retry` for a stuck ticket. */
    ticket_retried: z.looseObject({
        /** `resume`, `restart` (the ticket was edited), or `refused`. */
        mode: z.enum(['resume', 'restart', 'refused']),
        /** Why the edited ticket isn't ready to build, for `refused`. */
        problems: z.array(z.string()).catch([]),
    }),
    /** `because`: `null` when the owner skipped it, else the skipped ticket it waits on. */
    ticket_skipped: z.looseObject({
        because: z.number().int().nullable().catch(null),
    }),
    /** A ticket whose work was already on the base branch (#484), done by `shas`. */
    ticket_already_done: z.looseObject({
        shas: z.array(z.string()).catch([]),
    }),
    /** The engine closed an already-done ticket, as the run opens no PR. */
    ticket_closed: z.looseObject({}),

    // The final review (#367). Its agent, gate, scan, commit, and push
    // records are the usual kinds with `ticket: null`.
    final_review_started: z.looseObject({}),
    lens_started: z.looseObject({ lens: z.string() }),
    lens_finished: z.looseObject({
        lens: z.string(),
        findings: FindingCountsSchema,
    }),
    final_review_fixing: z.looseObject({ round: z.number().int().min(0) }),
    final_review_stuck: z.looseObject({
        reason: z.string(),
        detail: z.string().catch(''),
    }),
    final_review_passed: z.looseObject({}),
    /** A `ship` reply to the stuck final review: the PR opens anyway. */
    final_review_shipped: z.looseObject({}),

    // Memory (#370): counted, and its learner shown. The learner's agent
    // records are the usual kinds with `ticket: null` and role `learner`.
    /** A search at a recall point: each vault's outcome, and what it showed. */
    memory_recalled: z.looseObject({
        /** `run_start`, `ticket`, `review`, or `fix_round`. */
        point: z.string(),
        vaults: z
            .array(
                z.looseObject({
                    vault: z.string(),
                    ok: z.boolean(),
                    error: z.string().nullable().catch(null),
                })
            )
            .catch([]),
        memories: z.array(z.unknown()).catch([]),
    }),
    /** The learner's memories saved, refused, or failed. */
    memories_saved: z.looseObject({
        saves: z
            .array(
                z.looseObject({
                    /** `added`, `updated`, `refused`, or `failed`. */
                    outcome: z.string(),
                })
            )
            .catch([]),
    }),
    /** The engine gave up on the learner; the run ends without it. */
    learning_skipped: z.looseObject({ reason: z.string().catch('') }),
    /** With no PR, the new memories went on the spec issue. */
    memories_reported: z.looseObject({ count: z.number().int().catch(0) }),

    // The scheduler's steps (#403): what the engine is doing right now.
    /**
     * A step began. `key` is the scheduler's key (a ticket's number, `run`,
     * `final`, `lens:<lens>`, ...); `step` its action type, plus `:<role>`
     * for an agent's turn.
     */
    step_started: z.looseObject({ key: z.string(), step: z.string() }),
    /** The step on `key` settled. */
    step_ended: z.looseObject({ key: z.string(), step: z.string() }),
    /**
     * A ticket began to wait between steps (#559), for `for` on
     * `on_ticket`, since `since`; its next `step_started` ends it. A reason
     * the board doesn't know reads as `null`.
     */
    ticket_waiting: z.looseObject({
        for: WaitForSchema.nullable().catch(null),
        on_ticket: z.number().int().nullable().catch(null),
        since: z.string(),
    }),
} as const
