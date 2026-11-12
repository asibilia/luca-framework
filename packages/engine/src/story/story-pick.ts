import type { StoryUnpack } from './story-comments'
import {
    defaultStoryHome,
    loadSharedStory,
    prNow,
    type Gh,
} from './story-github'
import type { StoryHome } from './story-home'
import { loadPrivateStory } from './story-store'

/**
 * Finding a PR's story across its two homes (#738): the PR's comments
 * (`shared`) and the private store on this computer (`private`).
 */

/** Where a story lives, from `StoryHomeSchema`. */
export type { StoryHome }

/** One home's answer for a PR, and the commit its story was written for. */
export type StoryCopy = {
    home: StoryHome
    found: StoryUnpack
    head_sha: string | null
}

/** The copy that was not used, as `status` reports it. */
export type OtherCopy = {
    home: StoryHome
    status: StoryUnpack['status']
    story_head_sha: string | null
}

const copyOf = ({ home, found }: { home: StoryHome; found: StoryUnpack }) => ({
    home,
    found,
    head_sha: found.status === 'ok' ? found.story.head_sha : null,
})

/**
 * Picks between the two homes' copies of a PR's story, so a stale copy
 * never hides a fresh one:
 *
 * 1. A copy written for the PR's current head beats one that wasn't.
 * 2. Otherwise a readable copy beats a broken one.
 * 3. Otherwise the repo's default home wins (`shared` in the user's own
 *    repo, `private` everywhere else).
 *
 * @example
 * pickStory({ copies, pr_head_sha, default_home: 'shared' }) // { used, other }
 */
export const pickStory = ({
    copies,
    pr_head_sha,
    default_home,
}: {
    copies: StoryCopy[]
    pr_head_sha: string
    default_home: StoryHome
}): { used: StoryCopy | null; other: StoryCopy | null } => {
    const [first, second] = copies
    if (first === undefined) return { used: null, other: null }
    if (second === undefined) return { used: first, other: null }
    const rank = (copy: StoryCopy) =>
        (copy.head_sha === pr_head_sha ? 4 : 0) +
        (copy.found.status === 'ok' ? 2 : 0) +
        (copy.home === default_home ? 1 : 0)
    return rank(first) >= rank(second)
        ? { used: first, other: second }
        : { used: second, other: first }
}

/**
 * The PR's saved story, the home it was found in, and the copy in the
 * other home when there is one. Both homes are read. A PR whose comments
 * can't be read (no network, no access) still gives up its private copy.
 *
 * Every reader (the helper, a review app, the engine) finds a story
 * through this one function, so they all follow the same rule.
 *
 * @example
 * const { found, home } = await findStory({ gh, stories_dir: storiesDir({ home: homedir(), env: process.env }), repo: 'acme/site', pr_number: 12 })
 * if (found.status === 'ok') show(found.story)
 */
export const findStory = async ({
    gh,
    stories_dir,
    repo,
    pr_number,
}: {
    gh: Gh
    /** The private store's folder (see `storiesDir`). */
    stories_dir: string
    repo: string
    pr_number: number
}): Promise<{
    found: StoryUnpack
    home: StoryHome | null
    other_copy: OtherCopy | null
}> => {
    const kept = await loadPrivateStory({
        stories_dir,
        repo,
        pr_number,
    })
    let posted: StoryUnpack
    try {
        posted = await loadSharedStory({ gh, repo, pr_number })
    } catch (error) {
        if (kept.status === 'none') throw error
        posted = { status: 'none' }
    }
    const copies = [
        copyOf({ home: 'private', found: kept }),
        copyOf({ home: 'shared', found: posted }),
    ].filter(({ found }) => found.status !== 'none')
    const tie = copies.length === 2
    const { used, other } = pickStory({
        copies,
        pr_head_sha: tie ? (await prNow({ gh, repo, pr_number })).head_sha : '',
        default_home: tie
            ? (await defaultStoryHome({ gh, repo })).home
            : 'private',
    })
    if (used === null) {
        return { found: { status: 'none' }, home: null, other_copy: null }
    }
    return {
        found: used.found,
        home: used.home,
        other_copy:
            other === null
                ? null
                : {
                      home: other.home,
                      status: other.found.status,
                      story_head_sha: other.head_sha,
                  },
    }
}
