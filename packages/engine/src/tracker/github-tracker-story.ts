import { homedir } from 'node:os'

import { ghError, type GhRunner } from './gh-retry'
import {
    isTrackerNetworkFailure,
    otherRepoStoryError,
    TrackerError,
    type Tracker,
} from './tracker'

import { defaultStoryHome, type Gh } from '../story/story-github'
import { saveStoryWith } from '../story/story-save'
import { storiesDir } from '../story/story-store'

/**
 * The #738 `Gh` adapter on the tracker's own `gh` runner (#742). Each call
 * is made once, with none of the tracker's quick retries: one story comment
 * posted twice is worse than one save tried again. A call the tracker's
 * classifier (`ghError`) calls a network failure throws that network
 * `TrackerError`, so it reaches the engine's network wait; any other failed
 * call is answered `ok: false`.
 */
export const storyGh =
    ({ run }: { run: GhRunner }): Gh =>
    async ({ args, input }) => {
        const result =
            input === undefined ? await run(args) : await run(args, { input })
        const { stdout, stderr } = result
        if (result.exit_code === 0 && result.timed_out !== true) {
            return { ok: true, stdout, stderr }
        }
        const error = ghError({ args, result })
        if (isTrackerNetworkFailure(error)) throw error
        return { ok: false, stdout, stderr }
    }

/**
 * The GitHub tracker's story operations (#742): which home a story for
 * `repo` goes to, and saving one there, through `saveStoryWith`. An error
 * the save throws that is not a `TrackerError` is thrown on as one, with
 * the same message.
 *
 * @param stories_dir - The private stories folder. Defaults to `storiesDir`
 *   for the real home folder and environment.
 */
export const gitHubStoryOperations = ({
    repo,
    run,
    stories_dir,
}: {
    repo: string
    run: GhRunner
    stories_dir?: string
}): Pick<Tracker, 'storyHome' | 'saveStory'> => {
    const gh = storyGh({ run })
    const folder =
        stories_dir ?? storiesDir({ home: homedir(), env: process.env })
    return {
        storyHome: async () => (await defaultStoryHome({ gh, repo })).home,
        saveStory: async ({ story }) => {
            if (story.repo !== repo) {
                throw otherRepoStoryError({ story_repo: story.repo, repo })
            }
            try {
                const saved = await saveStoryWith({
                    gh,
                    story,
                    stories_dir: folder,
                })
                return saved.status === 'saved'
                    ? {
                          status: 'saved',
                          home: saved.home,
                          comments: saved.comments,
                      }
                    : { status: 'head_moved', pr_head_sha: saved.pr_head_sha }
            } catch (error) {
                if (error instanceof TrackerError) throw error
                throw new TrackerError(
                    error instanceof Error ? error.message : String(error)
                )
            }
        },
    }
}
