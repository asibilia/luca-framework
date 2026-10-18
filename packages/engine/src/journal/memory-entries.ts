import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import {
    MemoryFeedbackSchema,
    MemorySaveSchema,
    RecalledMemorySchema,
    RecallPointSchema,
    VaultSearchSchema,
} from '../memory/memory-schemas'

/**
 * The journal entries of memory (#370): recalls, the learner's saves and
 * feedback, each MuninnDB write, and a skipped or reported learning.
 */

/**
 * The engine searched memory at a **recall point**: the vaults it searched
 * (each with how it went and how many it found), and the memories it will
 * show, merged by score, at most `MAX_MEMORIES_PER_RECALL`, each with its
 * vault and score. `key` names the moment (such as `ticket:11`), so each is
 * searched once. `ticket` is the ticket's, or `null` for the run's start
 * and the final review.
 */
export const MemoryRecalledEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memory_recalled'),
    content: z.object({
        point: RecallPointSchema,
        key: z.string().min(1),
        query: z.string(),
        vaults: z.array(VaultSearchSchema),
        memories: z.array(RecalledMemorySchema),
    }),
})

/**
 * The learner's proposed memories were saved (or refused, or failed), each
 * with its vault, what became of it, and the similar memory the engine
 * found first; then the helped / didn't-help feedback on each memory shown
 * in the run. Written once per run, with `ticket: null`.
 */
export const MemoriesSavedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memories_saved'),
    content: z.object({
        saves: z.array(MemorySaveSchema),
        feedback: z.array(MemoryFeedbackSchema),
    }),
})

/**
 * The engine is about to make one MuninnDB write of `save_memories` (#369):
 * a save (`update_id` names the similar memory it updates, `muninn_evolve`;
 * `null` adds a new one, `muninn_remember` with `op_id`) or a feedback on a
 * shown memory. `write_key` names it within its step: `save:<op_id>` or
 * `feedback:<vault>:<id>`. A redo of the step repeats a save started but
 * not done the same way, and never sends such a feedback again.
 */
export const MemoryWriteStartedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memory_write_started'),
    content: z.discriminatedUnion('what', [
        z.object({
            write_key: z.string().min(1),
            what: z.literal('save'),
            vault: z.string().min(1),
            concept: z.string(),
            op_id: z.string().min(1),
            update_id: z.string().nullable(),
            similar: MemorySaveSchema.shape.similar,
        }),
        z.object({
            write_key: z.string().min(1),
            what: z.literal('feedback'),
            vault: z.string().min(1),
            id: z.string().min(1),
            useful: z.boolean(),
        }),
    ]),
})

/**
 * One MuninnDB write of `save_memories` settled (or a save failed before
 * its write): its outcome, which a redo of the step reuses as it is. Its
 * step's `memories_saved` lists them all.
 */
export const MemoryWriteDoneEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memory_write_done'),
    content: z.discriminatedUnion('what', [
        z.object({
            write_key: z.string().min(1),
            what: z.literal('save'),
            save: MemorySaveSchema,
        }),
        z.object({
            write_key: z.string().min(1),
            what: z.literal('feedback'),
            feedback: MemoryFeedbackSchema,
        }),
    ]),
})

/** The learner never gave a usable answer; the run ends without it. */
export const LearningSkippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('learning_skipped'),
    content: z.object({ reason: z.string() }),
})

/**
 * With no PR to list them in, the new memories went on the spec issue in
 * the engine's comment `comment_id`.
 */
export const MemoriesReportedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('memories_reported'),
    content: z.object({
        comment_id: z.number().int(),
        count: z.number().int().min(0),
    }),
})
