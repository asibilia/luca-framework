import { z } from 'zod'

import {
    CurrentStepSchema,
    EngineEndedSchema,
    RunStatusSchema,
    TicketStageSchema,
    UsageLevelSchema,
    USAGE_LABEL,
} from './board-state'

/**
 * The rows the plugin's server appends into the chat a run was started from.
 * The client registers one renderer per kind and validates `data` with the
 * same schema. Rows never reach the model.
 */

export const ROW_VERSION = 1

export const ROW_KIND = {
    run: 'luca-board-run',
    event: 'luca-board-event',
    stuck: 'luca-board-stuck',
    limit: 'luca-board-limit',
} as const

export const ToneSchema = z.enum(['info', 'success', 'warning', 'danger'])

export type Tone = z.infer<typeof ToneSchema>

const UsageLineSchema = z.object({
    five_hour_percent: z.number().nullable(),
    weekly_percent: z.number().nullable(),
    five_hour_level: UsageLevelSchema.nullable(),
    weekly_level: UsageLevelSchema.nullable(),
})

/** The run's header row, updated in place. */
export const RunRowSchema = z.object({
    run_id: z.string(),
    spec_number: z.number().nullable(),
    spec_title: z.string().nullable(),
    demo: z.boolean(),
    status: RunStatusSchema,
    /** Ticket counts per stage, stages with no tickets left out. */
    counts: z.array(z.object({ stage: TicketStageSchema, count: z.number() })),
    final_review: z.string(),
    usage: UsageLineSchema.nullable(),
    /** What `usage` is, in words. Defaulted, so a row from before it still parses. */
    usage_label: z.string().default(USAGE_LABEL),
    limit_wait: z.boolean(),
    /**
     * The steps running now: each ticket's (`ticket` set) and the run's
     * (`ticket` null). Defaulted, so a row from before it still parses.
     */
    current_steps: z
        .array(CurrentStepSchema.extend({ ticket: z.number().nullable() }))
        .default([]),
    needs_you: z.number(),
    pr_url: z.string().nullable(),
    engine_ended: EngineEndedSchema.nullable(),
    log_path: z.string().nullable(),
    updated_at: z.string(),
})

export type RunRow = z.infer<typeof RunRowSchema>

/** One thing that happened. */
export const EventRowSchema = z.object({
    time: z.string(),
    ticket: z.number().nullable(),
    text: z.string(),
    tone: ToneSchema,
})

export type EventRow = z.infer<typeof EventRowSchema>

/** Stuck work waiting for a reply, updated in place when it's resolved. */
export const StuckRowSchema = z.object({
    status: z.enum(['waiting', 'resolved']),
    subject: z.string(),
    spec_number: z.number().nullable(),
    reason: z.string(),
    detail: z.string(),
    tried: z.array(z.string()),
    replies: z.array(z.string()),
    resolution: z.string().nullable(),
})

export type StuckRow = z.infer<typeof StuckRowSchema>

/** A limit wait, updated in place when it's over. */
export const LimitRowSchema = z.object({
    status: z.enum(['waiting', 'over']),
    resets_at: z.string().nullable(),
    /** The window that was hit, in words; `null` when not known. */
    window: z.string().nullable(),
    usage: UsageLineSchema.nullable(),
})

export type LimitRow = z.infer<typeof LimitRowSchema>

/** A row ready to append: its id is unique per run. */
export const BoardRowSchema = z.discriminatedUnion('kind', [
    z.object({
        id: z.string(),
        kind: z.literal(ROW_KIND.run),
        data: RunRowSchema,
    }),
    z.object({
        id: z.string(),
        kind: z.literal(ROW_KIND.event),
        data: EventRowSchema,
    }),
    z.object({
        id: z.string(),
        kind: z.literal(ROW_KIND.stuck),
        data: StuckRowSchema,
    }),
    z.object({
        id: z.string(),
        kind: z.literal(ROW_KIND.limit),
        data: LimitRowSchema,
    }),
])

export type BoardRow = z.infer<typeof BoardRowSchema>
