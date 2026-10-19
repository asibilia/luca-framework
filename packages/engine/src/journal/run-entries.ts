import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { AgentRoleSchema } from '../agents/role-results'
import { ConfigChangeSchema } from '../config/config-reload'
import { EngineConfigSchema } from '../config/engine-config'

/**
 * The journal entries of the run's own life: its start, resumes and config
 * reloads, a stop, and the scheduler's step records.
 */

export const RunStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_started'),
    content: z.object({
        spec_number: z.number().int().positive(),
        config: EngineConfigSchema,
        /** The branch the run branch starts from and its PR merges into. */
        base_branch: z.string().min(1).default('main'),
        /**
         * Memory for this run (#370): on, with the project's vault (`null`
         * searches only `default`), or `null` for off. Off leaves the run
         * exactly as it was before memory.
         */
        memory: z
            .object({ project_vault: z.string().min(1).nullable() })
            .nullable()
            .default(null),
        /**
         * The repo the run is on, as an absolute path, so `luca-run --resume`
         * can find it. `null` in older journals.
         */
        repo: z.string().min(1).nullable().default(null),
        /**
         * Luca's version the run started on (#460). `null` in older
         * journals.
         */
        luca_version: z.string().min(1).nullable().default(null),
    }),
})

/**
 * The engine started again on the run's journal (#460), on Luca's version
 * `luca_version`, which may differ from the one in `run_started`. Journaled
 * once per resume, before the engine's first step. Nothing reads it but
 * the board.
 */
export const EngineResumedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('engine_resumed'),
    content: z.object({ luca_version: z.string().min(1) }),
})

/**
 * A resume read the repo's `.luca/config.json` again (#516), and the
 * build fields it reloads (`RELOADED_FIELDS`) changed: each one, old to
 * new. Journaled right after the resume's `engine_resumed`, only when
 * something changed. Replay puts the new values on the run's config.
 */
export const ConfigReloadedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('config_reloaded'),
    content: z.object({ changes: z.array(ConfigChangeSchema).min(1) }),
})

/**
 * A resume could not take the repo's config (#516): it is missing, not
 * JSON, not a valid config, or one intake would refuse. The run keeps the
 * config it had and goes on. `reason` says what is wrong.
 */
export const ConfigReloadRefusedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('config_reload_refused'),
    content: z.object({ reason: z.string().min(1) }),
})

/**
 * The run stopped because going on was unsafe: the wrong credentials or
 * plan, the wrong model, or a foreign MCP server. A later `runEngine` on the
 * same journal picks the step up again.
 *
 * A `billing` stop (overage, or a billing error) sticks: the run never goes
 * on, however often the engine is started again on its journal.
 */
export const RunStoppedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_stopped'),
    content: z.object({
        reason: z.string(),
        role: AgentRoleSchema.nullable().default(null),
        billing: z.boolean().default(false),
        /**
         * The same step was cut off by a crash `MAX_CRASHES` times in a row
         * on a run-level key: like a billing stop, it sticks.
         */
        crashed: z.boolean().default(false),
    }),
})

/**
 * The scheduler is about to carry out one step: an action it started, other
 * than a wait. `key` is the scheduler's key for it (a ticket's number,
 * `final`, `lens:<lens>`, `replies`, or `run`), and `step` its action type,
 * plus `:<role>` for an agent's turn. `first_seq` is the `step_started` seq
 * of this step's first try when a crash cut off an earlier try of it, else
 * `null`. `ticket` is the action's ticket, and `role` the agent's role.
 */
export const StepStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('step_started'),
    content: z.object({
        key: z.string().min(1),
        step: z.string().min(1),
        first_seq: z.number().int().min(1).nullable().default(null),
    }),
})

/**
 * The step under `key` settled: its own records are in the journal, so it
 * is a checkpoint. Not written when the step threw.
 */
export const StepEndedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('step_ended'),
    content: z.object({
        key: z.string().min(1),
        step: z.string().min(1),
    }),
})

/**
 * A ticket began to wait on purpose between steps (#559): `baseline` for
 * another ticket's shared baseline tests, `join` for the join queue,
 * `start` for the start queue, each on `on_ticket`. Journaled once when the
 * wait starts, since `since`; the ticket's next `step_started` ends it.
 * Only the board reads it.
 */
export const TicketWaitingEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('ticket_waiting'),
    content: z.object({
        for: z.enum(['baseline', 'join', 'start']),
        on_ticket: z.number().int().positive().nullable(),
        since: z.iso.datetime(),
    }),
})

/** One step a crash cut off: its `step_started` had no `step_ended`. */
export const InterruptedStepSchema = z.object({
    key: z.string().min(1),
    step: z.string().min(1),
    ticket: z.number().int().positive().nullable(),
    role: z.string().nullable(),
    /** The seq of the cut-off step's `step_started`. */
    started_seq: z.number().int().min(1),
    /** That record's `first_seq`: the step's first try, if it was a redo. */
    first_seq: z.number().int().min(1).nullable(),
})

export type InterruptedStep = z.infer<typeof InterruptedStepSchema>

/**
 * A restarted engine found steps a crash cut off, journaled once before its
 * first step. Each is taken again, an agent's turn in a fresh session.
 */
export const RunResumedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('run_resumed'),
    content: z.object({ interrupted: z.array(InterruptedStepSchema) }),
})
