import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { readStory, type Story, type StoryRead } from './story-schema'

/**
 * The private home of a story (#738): a file on this computer, for a PR
 * in a repo where nothing should be posted (someone else's repo, a work
 * repo, open source). Nothing here talks to GitHub.
 *
 * One file per PR, replaced on every save:
 *
 *   <stories folder>/<owner>/<repo>/pr-<number>.json
 *
 * The stories folder is `~/.local/state/luca/stories`, next to the engine's
 * runs folder; `LUCA_STORIES_DIR` overrides it. A review app reads the
 * same path.
 *
 * It uses Node's own modules only, so a review app can import it too.
 */

/**
 * The folder private stories are kept in.
 *
 * @example
 * storiesDir({ home: homedir(), env: process.env }) // '/Users/me/.local/state/luca/stories'
 */
export const storiesDir = ({
    home,
    env,
}: {
    home: string
    env: Record<string, string | undefined>
}): string =>
    env.LUCA_STORIES_DIR || join(home, '.local', 'state', 'luca', 'stories')

const REPO = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/

/**
 * The file one PR's private story lives in.
 *
 * @throws When `repo` isn't `owner/name`, so a bad name can't leave the folder.
 * @example
 * privateStoryPath({ stories_dir, repo: 'acme/site', pr_number: 12 }) // '<stories_dir>/acme/site/pr-12.json'
 */
export const privateStoryPath = ({
    stories_dir,
    repo,
    pr_number,
}: {
    stories_dir: string
    repo: string
    pr_number: number
}): string => {
    const [, owner, name] = REPO.exec(repo) ?? []
    if (!owner || !name || owner.startsWith('.') || name.startsWith('.')) {
        throw new Error(`"${repo}" is not an owner/name repo`)
    }
    return join(stories_dir, owner, name, `pr-${pr_number}.json`)
}

/**
 * Saves a story privately, over the PR's earlier one. Written to a
 * temporary file first, so a reader never sees half a story.
 *
 * @returns The file it was saved to.
 */
export const savePrivateStory = async ({
    stories_dir,
    story,
}: {
    stories_dir: string
    story: Story
}): Promise<string> => {
    const path = privateStoryPath({
        stories_dir,
        repo: story.repo,
        pr_number: story.pr_number,
    })
    await mkdir(dirname(path), { recursive: true })
    await writeFile(`${path}.tmp`, `${JSON.stringify(story, null, 2)}\n`)
    await rename(`${path}.tmp`, path)
    return path
}

/**
 * Reads a PR's private story. `none` when there is no file. Never throws
 * for a missing or broken file.
 *
 * @example
 * const found = await loadPrivateStory({ stories_dir, repo: 'acme/site', pr_number: 12 })
 */
export const loadPrivateStory = async ({
    stories_dir,
    repo,
    pr_number,
}: {
    stories_dir: string
    repo: string
    pr_number: number
}): Promise<StoryRead | { status: 'none' }> => {
    const path = privateStoryPath({ stories_dir, repo, pr_number })
    let text: string
    try {
        text = await readFile(path, 'utf8')
    } catch {
        return { status: 'none' }
    }
    try {
        return readStory({ value: JSON.parse(text) })
    } catch {
        return { status: 'invalid', problems: [`${path} is not JSON`] }
    }
}
