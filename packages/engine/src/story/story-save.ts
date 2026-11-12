import { packStory } from './story-comments'
import {
    addReadyLabel,
    defaultStoryHome,
    postSharedStory,
    prNow,
    type Gh,
} from './story-github'
import type { StoryHome } from './story-pick'
import type { Story } from './story-schema'
import { removePrivateStory, savePrivateStory } from './story-store'

/** What one save did, or why the shared home refused it. */
export type StorySaveResult =
    | {
          status: 'saved'
          home: StoryHome
          /** How many story comments the PR now has; 0 for the private home. */
          comments: number
          updated: number
          created: number
          deleted: number
          /** Whether a private copy of the PR's story was removed. */
          removed_private: boolean
      }
    | { status: 'head_moved'; story_head_sha: string; pr_head_sha: string }

/**
 * Saves a story to its home (#742). The one save the `/luca-pr-prep`
 * helper's `save` command and the GitHub tracker both use, so the two can't
 * drift apart.
 *
 * - Private: writes the story file under `stories_dir`; nothing is posted.
 * - Shared: refuses a story whose `head_sha` is not the PR's head commit
 *   (`head_moved`, with nothing posted). Else it posts the story as comments,
 *   rewriting its earlier story comments in place, adds the `review-ready`
 *   label (creating it when the repo lacks it), and removes the PR's
 *   private copy, so it can't hide the posted story.
 *
 * It does not check the story against the schema: the caller does.
 *
 * @param home - Forces a home. Left out, the home is picked by
 *   `defaultStoryHome`.
 * @example
 * const saved = await saveStoryWith({ gh, story, stories_dir })
 */
export const saveStoryWith = async ({
    gh,
    story,
    stories_dir,
    home,
}: {
    gh: Gh
    story: Story
    stories_dir: string
    home?: StoryHome
}): Promise<StorySaveResult> => {
    const { repo, pr_number } = story
    const picked = home ?? (await defaultStoryHome({ gh, repo })).home
    if (picked === 'private') {
        await savePrivateStory({ stories_dir, story })
        return {
            status: 'saved',
            home: 'private',
            comments: 0,
            updated: 0,
            created: 0,
            deleted: 0,
            removed_private: false,
        }
    }
    const pr = await prNow({ gh, repo, pr_number })
    if (pr.head_sha !== story.head_sha) {
        return {
            status: 'head_moved',
            story_head_sha: story.head_sha,
            pr_head_sha: pr.head_sha,
        }
    }
    const posted = await postSharedStory({ gh, story })
    await addReadyLabel({ gh, repo, pr_number })
    const removed_private = await removePrivateStory({
        stories_dir,
        repo,
        pr_number,
    })
    return {
        status: 'saved',
        home: 'shared',
        comments: packStory({ story }).length,
        ...posted,
        removed_private,
    }
}
