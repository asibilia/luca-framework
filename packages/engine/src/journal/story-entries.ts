import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import { StoryHomeSchema } from '../story/story-home'

/**
 * The journal entries of the PR's story (#743): a story the engine's
 * checks refused, the step's two checkpoints, a saved story and a
 * skipped one, and the report of a skip (#744). All with `ticket: null`.
 */

/**
 * The story the story-writer answered failed the engine's checks; its
 * `agent_finished` comes just before. `problems` are the problem lines,
 * as the story schema's reader gives them. One failed try.
 */
export const StoryRefusedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('story_refused'),
    content: z.object({ problems: z.array(z.string()) }),
})

/**
 * The story was saved to its home (#742), for the PR's head `head_sha`.
 * `comments` is how many story comments the PR now has (0 for the private
 * home). A checkpoint: after it, nothing more is done for the story.
 */
export const StorySavedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('story_saved'),
    content: z.object({
        home: StoryHomeSchema,
        head_sha: z.string(),
        comments: z.number().int().min(0),
    }),
})

/**
 * Why a story was skipped: the last try failed a check (`story_invalid`),
 * gave no result or the engine failed to run the story-writer
 * (`agent_failed`), the PR's head moved (`head_moved`), or the tracker
 * refused the save (`save_failed`).
 */
export const StorySkipReasonSchema = z.enum([
    'story_invalid',
    'agent_failed',
    'head_moved',
    'save_failed',
])

export type StorySkipReason = z.infer<typeof StorySkipReasonSchema>

/**
 * The story was skipped, and the run ends as it would have. `detail` is
 * one text: the problem lines, the last error, or the PR's head. A
 * checkpoint: after it, nothing more is tried for the story.
 */
export const StorySkippedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('story_skipped'),
    content: z.object({
        reason: StorySkipReasonSchema,
        detail: z.string(),
    }),
})

/**
 * The owner was told on the PR that its story was skipped (#744), in the
 * shared home only. `comment_id` is the skip comment's id, or `null` when
 * the tracker refused the comment. The report step's checkpoint.
 */
export const StorySkipReportedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('story_skip_reported'),
    content: z.object({ comment_id: z.number().int().nullable() }),
})
