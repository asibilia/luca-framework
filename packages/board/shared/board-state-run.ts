/**
 * The run in the board's state: where it stands (status and phase), why it
 * stopped, the run's own facts, the budget, the stuck work that needs a
 * reply, the tickets left out for a person, and the run list's summaries.
 */
import { z } from 'zod'

/**
 * Why the run stopped and what to do, in words. A billing stop, or a stop
 * after the same step crashed again and again, won't go on; any other stop
 * picks up again when the run is started with its run id.
 *
 * @example
 * stoppedText({ reason: 'overage in use', billing: true })
 * // 'Stopped for billing: overage in use. This run will not go on; ...'
 */
export const stoppedText = ({
    reason,
    billing,
    crashed,
}: {
    reason: string
    billing: boolean
    /** The same run-level step crashed again and again. */
    crashed?: boolean
}): string => {
    if (billing) {
        return `Stopped for billing: ${reason}. This run will not go on; start a new run once per-token billing is off.`
    }
    if (crashed === true) {
        return `Stopped after crashes: ${reason} This run will not go on; read the engine's log for why it crashed, then start a new run.`
    }
    return `The run stopped: ${reason}. Start it again with the same run id to pick up where it stopped.`
}

/** Where a run stands, as one word for the header row and the panel. */
export const RunStatusSchema = z.enum([
    'starting',
    'intake',
    'building',
    'final_review',
    'limit_wait',
    'usage_line_wait',
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

/** Stuck work waiting for a one-word reply on the spec issue. */
export const NeedsYouSchema = z.object({
    /** `ticket-<n>`, `final`, or `run` (the run stuck on its budget). */
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

/**
 * The engine's default run budget in tokens (its
 * `DEFAULT_RUN_BUDGET_TOKENS`, in `engine/src/limits/run-budget.ts`), for a
 * run whose engine config sets no `run_budget_tokens`. The plugin never
 * loads the engine's code, so the number is kept here too.
 */
export const DEFAULT_RUN_BUDGET_TOKENS = 9_000_000

/**
 * The engine's default `models.confidence_bar` (in
 * `engine/src/config/engine-config-schema.ts`): the decision model is sharp at or
 * over it, split under it. Kept here for the same reason.
 */
export const DEFAULT_CONFIDENCE_BAR = 0.8

export const EngineEndedSchema = z.object({
    ok: z.boolean(),
    message: z.string(),
})

export type EngineEnded = z.infer<typeof EngineEndedSchema>

/**
 * The run stopped because going on was unsafe (wrong credentials or plan,
 * a rejected rate limit, overage, ...). Starting it again with the same run
 * id picks the step up again, except after a billing stop, which won't go on.
 */
export const RunStoppedSchema = z.object({
    reason: z.string(),
    role: z.string().nullable(),
    ticket: z.number().int().nullable(),
    /** The session would bill per token; this run won't go on. */
    billing: z.boolean(),
    /** The same step crashed again and again; this run won't go on. */
    crashed: z.boolean().default(false),
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
    /**
     * Luca's version the run started on (#460); `null` when its journal
     * doesn't say. Defaulted, so an older board state still parses.
     */
    started_on: z.string().nullable().default(null),
    /**
     * Set once the run resumed on a different Luca version than it started
     * on, naming both. The run keeps going. Defaulted, so an older board
     * state still parses.
     */
    version_note: z.string().nullable().default(null),
    /**
     * The spec's owner (its issue's author), from intake (#503): only their
     * replies count. `null` when the journal doesn't say. Defaulted, so an
     * older board state still parses.
     */
    spec_author: z.string().nullable().default(null),
    /** The spec's repo as `owner/repo`, from its URL; `null` when not known. */
    spec_repo: z.string().nullable().default(null),
})

export type RunInfo = z.infer<typeof RunInfoSchema>

/** The run phases after which no engine is needed. */
export const OVER_PHASES: ReadonlySet<RunPhase> = new Set<RunPhase>([
    'done',
    'refused',
    'nothing_to_do',
])

/**
 * Whether a run may still need an engine: not ended, not over. The
 * server's engine check and the panel's "no sign of life" both go by it.
 *
 * @example
 * needsEngine({ state }) // true while the run builds
 */
export const needsEngine = ({ state }: { state: { run: RunInfo } }): boolean =>
    state.run.engine_ended === null && !OVER_PHASES.has(state.run.phase)

/**
 * An open ticket the run left out for a person (#499): one labeled
 * `ready-for-human`, or one waiting on such a ticket. Not a problem, so the
 * board lists it calmly and nobody is asked to act.
 */
export const PersonTicketSchema = z.object({
    number: z.number().int(),
    title: z.string(),
    /** Why, in words: `for a person`, or `waits on #12, which is for a person`. */
    why: z.string(),
})

export type PersonTicket = z.infer<typeof PersonTicketSchema>

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

/** How many of the newest runs get a tab; the older ones are folded. */
export const RECENT_RUN_TABS = 6

/**
 * Splits runs (newest first) into the ones with a tab and the folded older
 * ones. A picked older run keeps a tab too, after the newest ones.
 *
 * @example
 * const { shown, folded } = foldRuns({ runs, selected: picked })
 */
export const foldRuns = ({
    runs,
    selected,
}: {
    runs: RunSummary[]
    selected: string | null
}): { shown: RunSummary[]; folded: RunSummary[] } => {
    const shown = runs.slice(0, RECENT_RUN_TABS)
    const older = runs.slice(RECENT_RUN_TABS)
    const picked = older.find((run) => run.run_id === selected)
    return picked
        ? {
              shown: [...shown, picked],
              folded: older.filter((run) => run !== picked),
          }
        : { shown, folded: older }
}
