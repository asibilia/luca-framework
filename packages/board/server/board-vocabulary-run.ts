/**
 * The board's vocabulary for the run and its tickets: how a run starts,
 * resumes, and passes intake, the snapshots of the spec and its tickets, the
 * baseline, and what each agent does and how its turn ends.
 */
import { z } from 'zod'

import {
    AgentSessionSchema,
    FindingListSchema,
    FindingResponseListSchema,
    LeftOutListSchema,
    RulingListSchema,
    SpecIssueSchema,
    TestRunSchema,
    WorktreeSchema,
} from './board-vocabulary-shapes'

export const RUN_VOCABULARY = {
    run_started: z.looseObject({
        spec_number: z.number().int(),
        /** The engine config; the board reads only its run budget. */
        config: z
            .looseObject({
                run_budget_tokens: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .catch(undefined),
            })
            .optional()
            .catch(undefined),
        /** Luca's version the run started on (#460); older journals have none. */
        luca_version: z.string().nullable().catch(null),
    }),
    /** The engine started again on the run's journal, on Luca's `luca_version`. */
    engine_resumed: z.looseObject({ luca_version: z.string() }),
    /**
     * A resume took the repo's new build fields (#516); the board reads
     * only which fields changed.
     */
    config_reloaded: z.looseObject({
        changes: z.array(z.looseObject({ field: z.string() })),
    }),
    /** A resume kept the run's config, as the repo's couldn't be used. */
    config_reload_refused: z.looseObject({ reason: z.string() }),
    intake_read: z.looseObject({ spec: SpecIssueSchema }),
    intake_refused: z.looseObject({
        problems: z.array(
            z.looseObject({
                ticket: z.number().nullable(),
                missing: z.array(z.string()),
            })
        ),
    }),
    /**
     * The run ends with nothing to do; `already_done` is empty at intake
     * (#484), and `left_out` names the tickets left for a person (#499).
     */
    nothing_to_do: z.looseObject({
        already_done: z.array(z.number().int()).catch([]).default([]),
        left_out: LeftOutListSchema,
    }),
    spec_snapshot: z.looseObject({
        spec: SpecIssueSchema,
        ticket_order: z.array(z.number()).catch([]),
        /** The tickets left out for a person (#499); older journals have none. */
        left_out: LeftOutListSchema,
    }),
    ticket_snapshot: z.looseObject({
        number: z.number().int(),
        title: z.string(),
        labels: z.array(z.string()).catch([]),
        blockers: z.array(z.number().int()).catch([]),
    }),
    run_branch_created: WorktreeSchema,
    ticket_worktree_created: WorktreeSchema,
    baseline_tests: TestRunSchema,
    /** Another ticket's baseline, taken from the same run-branch commit (#404). */
    baseline_reused: z.looseObject({ from_ticket: z.number().int() }),
    agent_started: z.looseObject({
        role: z.string(),
        /** The session a fix-loop or failed-try follow-up went to. */
        follow_up_of: z.string().nullable().catch(null),
    }),
    agent_finished: z.looseObject({
        role: z.string(),
        result: z
            .looseObject({
                outcome: z.string().optional(),
                verdict: z.string().optional(),
                findings: FindingListSchema.optional(),
                /** The ticket-reviewer's rulings on declined findings. */
                rulings: RulingListSchema,
                /** A review fixer's answer to each finding it got. */
                finding_responses: FindingResponseListSchema,
                /** The learner's proposed memories (#370). */
                memories: z.array(z.unknown()).catch([]).optional(),
                /** The shown memories the learner said helped. */
                helped: z.array(z.string()).catch([]).optional(),
            })
            .catch({ rulings: [], finding_responses: [] }),
    }),
    agent_failed: z.looseObject({
        role: z.string(),
        error: z.string(),
        /** `agent`, `result`, `guard`, or `engine`. */
        failure: z.string().catch('agent'),
    }),
    agent_session: z.looseObject({
        role: z.string(),
        session: AgentSessionSchema,
    }),
    run_stopped: z.looseObject({
        reason: z.string(),
        role: z.string().nullable().catch(null),
        /** A billing stop: the session would bill per token. */
        billing: z.boolean().catch(false),
        /** A stop after the same step crashed again and again. */
        crashed: z.boolean().catch(false),
    }),
} as const
