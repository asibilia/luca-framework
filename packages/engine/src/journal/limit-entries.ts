import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { AgentRoleSchema } from '../agents/role-results'
import { UsageRecordSchema } from '../limits/plan-usage'

/**
 * The journal entries of plan limits: limit waits, usage-line waits, and
 * recorded plan usage.
 */

/**
 * A plan window was used up (a rejected rate limit), so the whole run waits
 * until `until`: the window's reset plus a margin, or a default wait when the
 * reading named no reset. Written with `ticket: null`; the agent whose turn
 * hit the limit is `hit_ticket` and `hit_role`.
 */
export const LimitWaitStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('limit_wait_started'),
    content: z.object({
        /** When the window resets, if the reading said. */
        resets_at: z.iso.datetime().nullable(),
        /** When the engine wakes and carries on. */
        until: z.iso.datetime(),
        /** The window, such as `five_hour`, `seven_day`, or `seven_day_opus`. */
        rate_limit_type: z.string().nullable(),
        hit_ticket: z.number().int().positive().nullable(),
        hit_role: AgentRoleSchema.nullable(),
    }),
})

/** The limit wait is over; the run carries on where it was cut off. */
export const LimitWaitEndedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('limit_wait_ended'),
    content: z.object({ until: z.iso.datetime() }),
})

/** The plan windows a usage line guards: all-models weekly, and 5-hour. */
export const UsageLineWindowSchema = z.enum(['seven_day', 'five_hour'])

export type UsageLineWindow = z.infer<typeof UsageLineWindowSchema>

/**
 * The newest plan-window reading was at or over its **usage line**, so the
 * whole run pauses until `until`: the window's reset plus a margin. The wait
 * ends sooner once the line is raised above `percent`.
 */
export const UsageLineWaitStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('usage_line_wait_started'),
    content: z.object({
        window: UsageLineWindowSchema,
        /** The line, in percent of the window. */
        line: z.number(),
        /** The reading's fill level, in percent. */
        percent: z.number(),
        /** When the window resets. */
        resets_at: z.iso.datetime(),
        /** When the engine wakes and carries on, at the latest. */
        until: z.iso.datetime(),
    }),
})

/**
 * The usage-line wait is over: the window reset (`reset`), or the line was
 * raised above the reading (`line_raised`).
 */
export const UsageLineWaitEndedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('usage_line_wait_ended'),
    content: z.object({
        until: z.iso.datetime(),
        reason: z.enum(['reset', 'line_raised']),
    }),
})

/**
 * The plan usage of one ticket (when it was pushed, or got stuck) or of the
 * whole run (when it ended): tokens from its agent sessions, and how far
 * each plan window moved. A retried ticket that finishes again gets another,
 * over all of its sessions: the latest is its whole usage.
 */
export const UsageRecordedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('usage_recorded'),
    content: UsageRecordSchema,
})
