import { z } from 'zod'

/**
 * Where a story lives (#738): the PR's comments (`shared`) or the private
 * store on this computer (`private`). The one list of homes: the two-homes
 * rule, the tracker and the journal's `story_saved` all use it.
 */
export const StoryHomeSchema = z.enum(['shared', 'private'])

export type StoryHome = z.infer<typeof StoryHomeSchema>
