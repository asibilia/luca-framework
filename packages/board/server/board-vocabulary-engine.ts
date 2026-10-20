/**
 * The board's vocabulary for what the engine does while it builds: worktrees
 * and installs, the checks, joins and rebases, stuck tickets, the PR, the
 * decision model, agent messages, and plan limits and usage.
 */
import { z } from 'zod'

import {
    JevAnsweredSchema,
    JevJobSchema,
    TestRunSchema,
} from './board-vocabulary-shapes'

export const ENGINE_VOCABULARY = {
    worktree_reset: z.looseObject({}),
    /** The engine's install in a new worktree; `check` is null with no manifest. */
    dependencies_installed: z.looseObject({
        target: z.string(),
        check: z
            .looseObject({ command: z.string(), ok: z.boolean() })
            .nullable(),
    }),
    red_check: z.looseObject({
        ok: z.boolean(),
        problems: z.array(z.string()).catch([]),
        tests: TestRunSchema.optional(),
    }),
    leftover_scan: z.looseObject({
        /** `red`, `green`, or `fix` (a review fix round). */
        stage: z.string(),
        hits: z.array(z.looseObject({ path: z.string() })),
    }),
    /** `stage` is `red`, `green`, or `fix` (a review fix round). */
    commit_made: z.looseObject({ stage: z.string() }),
    gates_run: z.looseObject({
        target: z.string(),
        ok: z.boolean(),
        checks: z.array(z.looseObject({ name: z.string(), ok: z.boolean() })),
    }),
    ticket_joined: z.looseObject({
        ok: z.boolean(),
        error: z.string().optional(),
    }),
    /** A joined ticket sent back to be fixed on top of the run branch. */
    ticket_rebased: z.looseObject({
        /** `clash` or `join_gates`. */
        cause: z.string(),
        tests: z.array(z.string()).catch([]),
        code: z.array(z.string()).catch([]),
    }),
    /**
     * After a rebase, a test the joined tickets made wrong went back to the
     * ticket's test-writer (#489). `round` counts these per ticket.
     */
    tests_sent_back: z.looseObject({
        round: z.number().int().min(1).catch(1),
        bad_test: z
            .looseObject({
                file: z.string().catch(''),
                name: z.string().catch(''),
            })
            .catch({ file: '', name: '' }),
        joined: z.array(z.looseObject({ ticket: z.number().int() })).catch([]),
    }),
    run_branch_pushed: z.looseObject({ branch: z.string() }),
    ticket_stuck: z.looseObject({
        reason: z.string(),
        detail: z.string().catch(''),
    }),
    /**
     * The whole run is stuck (#435): `run_budget`, it used up its budget,
     * or `pull_request_failed`, its PR didn't open (#508).
     */
    run_stuck: z.looseObject({
        reason: z.string(),
        detail: z.string().catch(''),
    }),
    pull_request_opened: z.looseObject({
        number: z.number().int(),
        url: z.string(),
    }),
    /** The run's worktrees, removed at its end. Nothing visible changes. */
    worktrees_removed: z.looseObject({
        paths: z.array(z.string()).catch([]),
    }),
    // The decision model (Clef; Jev in older journals) in shadow mode:
    // counted, never acted on.
    jev_asked: JevJobSchema,
    jev_answered: JevAnsweredSchema,
    jev_failed: JevJobSchema,
    /**
     * The decision model is off for the rest of the run (#534): no
     * credentials, or Cloudflare turned them down. The board reads only the
     * plain-words `detail`.
     */
    decision_model_off: z.looseObject({ detail: z.string().catch('') }),
    // Agent messages: sent inside an agent's turn, so they move nothing.
    agent_message: z.looseObject({
        from: z.string(),
        to: z.string(),
        text: z.string(),
        status: z.enum(['queued', 'not_delivered', 'refused']),
        reason: z.string().nullable().catch(null),
    }),
    agent_message_delivered: z.looseObject({
        ids: z.array(z.string()).catch([]),
    }),
    /** Another process changed the shared `.git` during an agent's turn. */
    shared_git_changed: z.looseObject({
        role: z.string().catch(''),
        changes: z.array(z.string()).catch([]),
    }),
    limit_wait_started: z.looseObject({
        /** When the limit resets; `null` when not known. */
        resets_at: z.string().nullable().catch(null),
        /** When the engine wakes; always set by the engine. */
        until: z.string().nullable().catch(null),
        /** The window that was hit: `five_hour`, `seven_day`, ... */
        rate_limit_type: z.string().nullable().catch(null),
    }),
    limit_wait_ended: z.looseObject({}),
    /** The run paused at a usage line. */
    usage_line_wait_started: z.looseObject({
        /** `seven_day` or `five_hour`. */
        window: z.string(),
        /** The line, in percent. */
        line: z.number(),
        /** How full the window was, in percent. */
        percent: z.number(),
        /** When the window resets. */
        resets_at: z.string(),
    }),
    /** The run carries on: `reason` is `reset` or `line_raised`. */
    usage_line_wait_ended: z.looseObject({}),
    /** How much of the plan a ticket (scope `ticket`) or the run used. */
    usage_recorded: z.looseObject({
        scope: z.enum(['ticket', 'run']),
        ticket: z.number().int().nullable().catch(null),
        /** Percents 0 to 100 per window, before and after, and the difference. */
        windows: z
            .record(z.string(), z.looseObject({ used: z.number() }))
            .catch({}),
    }),
} as const
