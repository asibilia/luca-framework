import { z } from 'zod'

/**
 * **Memory**'s shapes (#370), as Zod schemas: what a search finds, what the
 * journal keeps of each search and save, and the numbers the engine uses.
 * Only the engine talks to MuninnDB; agents never do.
 */

/** The vault every run searches, and where cross-project lessons go. */
export const DEFAULT_VAULT = 'default'

/**
 * The lowest score a recalled memory may have to be shown. MuninnDB's own
 * default threshold; its scores can go above 1.
 */
export const MIN_MEMORY_SCORE = 0.5

/** The most memories one **recall point** hands an agent. */
export const MAX_MEMORIES_PER_RECALL = 5

/**
 * How close (MuninnDB's `vector_score`) a stored memory must be to a new
 * one for the engine to update it (evolve) instead of adding a new one.
 */
export const SIMILAR_MEMORY_SCORE = 0.85

/** How long one call to MuninnDB may take before the engine moves on. */
export const DEFAULT_MEMORY_TIMEOUT_MS = 10_000

/**
 * The fixed moments a run searches memory:
 * - `run_start`: once, before the run branch, from the spec's text;
 * - `ticket`: before a ticket's first test-writer or implementer;
 * - `review`: before each ticket review and each final review round;
 * - `fix_round`: before each fix round, from the failure text.
 */
export const RecallPointSchema = z.enum([
    'run_start',
    'ticket',
    'review',
    'fix_round',
])

export type RecallPoint = z.infer<typeof RecallPointSchema>

/** One memory a search found, as MuninnDB scored it. */
export const MemoryHitSchema = z.object({
    id: z.string().min(1),
    concept: z.string(),
    content: z.string(),
    /** MuninnDB's relevance score; can go above 1. */
    score: z.number(),
    /** How close its meaning is (0 to 1), when MuninnDB says. */
    vector_score: z.number().nullable(),
})

export type MemoryHit = z.infer<typeof MemoryHitSchema>

/** A memory shown to agents: a hit, and the vault it came from. */
export const RecalledMemorySchema = z.object({
    id: z.string().min(1),
    vault: z.string().min(1),
    concept: z.string(),
    content: z.string(),
    score: z.number(),
})

export type RecalledMemory = z.infer<typeof RecalledMemorySchema>

/** How one vault's search went at a recall point. */
export const VaultSearchSchema = z.object({
    vault: z.string().min(1),
    ok: z.boolean(),
    /** Why the search failed (an error or a timeout); `null` when ok. */
    error: z.string().nullable(),
    /** How many memories the vault gave back, before the merge. */
    found: z.number().int().min(0),
})

export type VaultSearch = z.infer<typeof VaultSearchSchema>

/** What became of one memory the learner proposed. */
export const SaveOutcomeSchema = z.enum([
    'added',
    'updated',
    'refused',
    'failed',
])

export type SaveOutcome = z.infer<typeof SaveOutcomeSchema>

/** One proposed memory's save, as journaled. */
export const MemorySaveSchema = z.object({
    type: z.string(),
    /** The stored concept, `<type>:<concept>`. */
    concept: z.string(),
    /** The vault its type picked; `null` when refused before routing. */
    vault: z.string().nullable(),
    outcome: SaveOutcomeSchema,
    /** The memory added or updated; `null` when refused or failed. */
    id: z.string().nullable(),
    /** The most similar stored memory found first, if any. */
    similar: z
        .object({
            id: z.string(),
            score: z.number(),
            vector_score: z.number().nullable(),
        })
        .nullable(),
    /** Why it was refused or failed; `null` otherwise. */
    error: z.string().nullable(),
})

export type MemorySave = z.infer<typeof MemorySaveSchema>

/** The helped / didn't-help feedback on one shown memory, as journaled. */
export const MemoryFeedbackSchema = z.object({
    id: z.string().min(1),
    vault: z.string().min(1),
    useful: z.boolean(),
    ok: z.boolean(),
    error: z.string().nullable(),
})

export type MemoryFeedback = z.infer<typeof MemoryFeedbackSchema>
