/**
 * The PR's story's half of the decision step (#743). Pure. Once the run's
 * PR is open, and before the run branch's worktree goes, the story-writer
 * writes the PR's story, the engine checks and saves it, or skips it after
 * its tries run out. It never makes the run stuck.
 */
import { MAX_ENGINE_FAILURES, MAX_FIX_ROUNDS } from './loop-caps'
import { storyFollowUp } from './story-prompt'
import { storyStateOf } from './story-state'

import { prStoryOf } from '../config/engine-config'
import type { JournalRecord } from '../journal/journal-record'
import type { RunState } from '../journal/replay'
import type { StorySkipReason } from '../journal/story-entries'

/** The story step's actions; each type is its step's name. */
export type StoryAction =
    /**
     * Start a fresh story-writer in the run branch's worktree. Its prompt
     * ends with the latest refusal's `problems`, if any.
     */
    | { type: 'launch_story_writer'; problems: string[] | null }
    /** Follow up the session that wrote a refused story, with `message`. */
    | { type: 'launch_story_writer'; session_id: string; message: string }
    /**
     * Fill in the fields the engine knows on the latest answer, check the
     * story, write `story.json`, and save it.
     */
    | { type: 'save_story' }
    /** Give the story up: journal `story_skipped`. */
    | { type: 'skip_story'; reason: StorySkipReason; detail: string }

const STORY_ACTION_TYPES: ReadonlySet<string> = new Set<StoryAction['type']>([
    'launch_story_writer',
    'save_story',
    'skip_story',
])

/**
 * Whether an action is one of the story step's.
 *
 * @example
 * isStoryAction({ type: 'save_story' }) // true
 */
export const isStoryAction = <Action extends { type: string }>(
    action: Action
): action is Extract<Action, StoryAction> => STORY_ACTION_TYPES.has(action.type)

/**
 * The story step's next action, or `null` when there is none: no PR open
 * yet, a `stop`, the story turned off (`pr_story`), the run branch's
 * worktree already removed, or a checkpoint (`story_saved`,
 * `story_skipped`) reached.
 *
 * @example
 * decideStory({ state, records }) // { type: 'launch_story_writer', problems: null }
 */
export const decideStory = ({
    state,
    records,
}: {
    state: RunState
    records: JournalRecord[]
}): StoryAction | null => {
    const { config, pull_request, run_branch, stop } = state
    if (config === null || !prStoryOf({ config })) return null
    if (pull_request === null || stop !== null || run_branch === null) {
        return null
    }
    if (state.removed_worktrees.includes(run_branch.path)) return null
    const story = storyStateOf({ records })
    if (story.done) return null
    if (story.answer !== null) return { type: 'save_story' }
    const failed = story.last_failure
    if (
        failed !== null &&
        (story.engine_failures >= MAX_ENGINE_FAILURES ||
            story.failed_tries >= MAX_FIX_ROUNDS)
    ) {
        return { type: 'skip_story', ...failed }
    }
    if (story.follow_up !== null && story.problems !== null) {
        return {
            type: 'launch_story_writer',
            session_id: story.follow_up,
            message: storyFollowUp({ problems: story.problems }),
        }
    }
    return { type: 'launch_story_writer', problems: story.problems }
}
