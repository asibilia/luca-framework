/**
 * The pieces the board's kind schemas are built from: findings and rulings,
 * test runs, worktrees, the tickets left out for a person, the spec issue, an
 * agent's session with its tokens and rate-limit readings, and the decision
 * model's jobs. Loose on purpose, like the kinds: extra fields are fine.
 */
import { z } from 'zod'

export const FindingCountsSchema = z.looseObject({
    blocker: z.number().int().min(0).catch(0),
    should_fix: z.number().int().min(0).catch(0),
    nit: z.number().int().min(0).catch(0),
})

export const FindingListSchema = z.array(
    z.looseObject({
        id: z.string().catch(''),
        severity: z.enum(['blocker', 'should_fix', 'nit']),
    })
)

/** A re-reviewer's ruling on a fixer's "won't fix" of a review finding. */
export const RulingListSchema = z
    .array(
        z.looseObject({
            finding_id: z.string(),
            ruling: z.enum(['accepted', 'rejected']),
            reason: z.string().catch(''),
        })
    )
    .catch([])

/** A review fixer's answer to each finding: `fixed` or `wont_fix`. */
export const FindingResponseListSchema = z
    .array(
        z.looseObject({
            finding_id: z.string(),
            response: z.enum(['fixed', 'wont_fix']),
            reason: z.string().catch(''),
        })
    )
    .catch([])

export const TestRunSchema = z.looseObject({
    cases: z.array(z.looseObject({ status: z.string() })),
})

export const WorktreeSchema = z.looseObject({ branch: z.string() })

/**
 * The open tickets intake left out for a person (#499): `for_a_person`, or
 * `waits_on_person` with the tickets for a person it `waits_on`, and the
 * blockers it waits `through`. Missing in older journals.
 */
export const LeftOutListSchema = z
    .array(
        z.looseObject({
            number: z.number().int(),
            title: z.string().catch(''),
            reason: z.enum(['for_a_person', 'waits_on_person']),
            waits_on: z.array(z.number().int()).catch([]).default([]),
            through: z.array(z.number().int()).catch([]).default([]),
        })
    )
    .catch([])
    .default([])

export type LeftOutList = z.infer<typeof LeftOutListSchema>

const tokenCount = z.number().min(0).catch(0)

/** One plan window's reading: `utilization` 0 to 1, `resetsAt` in seconds. */
const WindowReadingSchema = z.looseObject({
    utilization: z.number().optional().catch(undefined),
    resetsAt: z.number().optional().catch(undefined),
})

/**
 * One `rate_limit_event`'s info, as the Claude Agent SDK sends it:
 * `utilization` is 0 to 1, `resetsAt` is in seconds since the epoch. Real
 * readings carry no top-level `utilization`; each window's is in
 * `unifiedWindows`, keyed by window name (`five_hour`, `seven_day`, ...).
 */
const RateLimitReadingSchema = z.looseObject({
    rateLimitType: z.string().optional().catch(undefined),
    utilization: z.number().optional().catch(undefined),
    resetsAt: z.number().optional().catch(undefined),
    unifiedWindows: z
        .record(z.string(), WindowReadingSchema.catch({}))
        .optional()
        .catch(undefined),
})

const TokensSchema = z
    .looseObject({
        input_tokens: tokenCount,
        output_tokens: tokenCount,
        cache_read_input_tokens: tokenCount,
        cache_creation_input_tokens: tokenCount,
    })
    .catch({
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
    })

/** The launcher's summary of an agent's session: tokens and readings. */
export const AgentSessionSchema = z.looseObject({
    /** The main loop's tokens. */
    usage: TokensSchema,
    /** The turn's tokens per model, subagents included; older journals have none. */
    model_usage: z.record(z.string(), TokensSchema).catch({}).default({}),
    rate_limit_events: z.array(RateLimitReadingSchema).catch([]),
})

export const JevJobSchema = z.looseObject({ job: z.string() })

/**
 * The spec issue as intake read it. `author` (the spec's owner, whose
 * replies alone count) and `url` feed the reply buttons (#503); older
 * journals may lack them.
 */
export const SpecIssueSchema = z.looseObject({
    number: z.number(),
    title: z.string(),
    author: z.string().optional().catch(undefined),
    url: z.string().optional().catch(undefined),
})
