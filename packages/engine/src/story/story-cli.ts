import { readFile, writeFile } from 'node:fs/promises'

import type { StoryUnpack } from './story-comments'
import {
    addReadyLabel,
    defaultStoryHome,
    loadSharedStory,
    postSharedStory,
    prNow,
    removeReadyLabel,
    REVIEW_READY_LABEL,
    type Gh,
} from './story-github'
import { readStory, STORY_SCHEMA_VERSION } from './story-schema'
import { loadPrivateStory, savePrivateStory, storiesDir } from './story-store'

/**
 * The `/luca-pr-prep` skill's helper (#738). The skill runs it as one
 * bundled file, `~/.claude/skills/luca-pr-prep/scripts/pr-story.js`
 * (built by `packages/engine/scripts/build-pr-story.ts`):
 *
 *   bun pr-story.js check <story.json>
 *   bun pr-story.js home <owner/repo> [--shared | --private]
 *   bun pr-story.js save <story.json> [--shared | --private]
 *   bun pr-story.js load <owner/repo> <pr number> [--out <file>]
 *   bun pr-story.js status <owner/repo> <pr number>
 *
 * - `check` reads a story file against the schema and prints every problem.
 * - `home` prints where a story for the repo goes: `shared` (PR comments
 *   and the `review-ready` label) or `private` (a file on this computer).
 * - `save` checks the story, then saves it to its home. A story that fails
 *   the check is never saved or posted. In the shared home it also
 *   refuses a story written for a commit that is no longer the PR's head.
 * - `load` prints the PR's saved story as JSON (to `--out`, or stdout).
 * - `status` prints one JSON line, `{ status, home, story_head_sha,
 *   pr_head_sha }`, with status `none`, `fresh`, `stale`, or `broken`. A
 *   stale shared story loses its `review-ready` label.
 *
 * Exit codes: 0 done, 1 the story is invalid or missing, 2 bad arguments
 * or a failed step.
 */

/** What the helper needs from the outside, so tests can stand in for it. */
export type StoryCliEnv = {
    argv: string[]
    gh: Gh
    home: string
    env: Record<string, string | undefined>
    out: (line: string) => void
    err: (line: string) => void
}

const USAGE = `Usage:
  bun pr-story.js check <story.json>
  bun pr-story.js home <owner/repo> [--shared | --private]
  bun pr-story.js save <story.json> [--shared | --private]
  bun pr-story.js load <owner/repo> <pr number> [--out <file>]
  bun pr-story.js status <owner/repo> <pr number>`

type Home = 'shared' | 'private'

/** The home a flag forces, or null when no flag was given. */
const forcedHome = ({ flags }: { flags: string[] }): Home | null => {
    if (flags.includes('--shared')) return 'shared'
    if (flags.includes('--private')) return 'private'
    return null
}

/** A story file, read and checked. Prints the problems when it is no good. */
const storyFromFile = async ({
    path,
    err,
}: {
    path: string
    err: (line: string) => void
}) => {
    let value: unknown
    try {
        value = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
        err(`${path} can't be read as JSON: ${String(error)}`)
        return null
    }
    const read = readStory({ value })
    if (read.status === 'ok') return read.story
    if (read.status === 'newer_version') {
        err(
            `${path} is schema_version ${read.schema_version}; this helper writes version ${STORY_SCHEMA_VERSION}. Run \`luca upgrade\`.`
        )
        return null
    }
    err(`${path} is not a valid story (${read.problems.length} problems):`)
    for (const problem of read.problems) err(`- ${problem}`)
    return null
}

/** The PR's saved story and which home it was found in: private first. */
const findStory = async ({
    cli,
    repo,
    pr_number,
}: {
    cli: StoryCliEnv
    repo: string
    pr_number: number
}): Promise<{ found: StoryUnpack; home: Home }> => {
    const kept = await loadPrivateStory({
        stories_dir: storiesDir(cli),
        repo,
        pr_number,
    })
    if (kept.status !== 'none') return { found: kept, home: 'private' }
    return {
        found: await loadSharedStory({ gh: cli.gh, repo, pr_number }),
        home: 'shared',
    }
}

const save = async ({ cli, args }: { cli: StoryCliEnv; args: string[] }) => {
    const [path, ...flags] = args
    if (path === undefined) return usage({ cli })
    const story = await storyFromFile({ path, err: cli.err })
    if (story === null) return 1
    const { gh } = cli
    const { repo, pr_number } = story
    const home =
        forcedHome({ flags }) ?? (await defaultStoryHome({ gh, repo })).home
    if (home === 'private') {
        const saved = await savePrivateStory({
            stories_dir: storiesDir(cli),
            story,
        })
        cli.out(`Saved privately: ${saved}. Nothing was posted.`)
        return 0
    }
    const pr = await prNow({ gh, repo, pr_number })
    if (pr.head_sha !== story.head_sha) {
        cli.err(
            `Not posted: the story is for ${story.head_sha.slice(0, 9)} but the PR's head is now ${pr.head_sha.slice(0, 9)}. Bring the story up to date first.`
        )
        return 1
    }
    const posted = await postSharedStory({ gh, story })
    await addReadyLabel({ gh, repo, pr_number })
    cli.out(
        `Posted on ${story.pr_url}: ${posted.updated} comments updated, ${posted.created} created, ${posted.deleted} deleted. Label ${REVIEW_READY_LABEL} added.`
    )
    return 0
}

const prArgs = ({ args }: { args: string[] }) => {
    const [repo, number] = args
    const pr_number = Number(number)
    if (repo === undefined || !Number.isInteger(pr_number) || pr_number < 1) {
        return null
    }
    return { repo, pr_number }
}

const load = async ({ cli, args }: { cli: StoryCliEnv; args: string[] }) => {
    const pr = prArgs({ args })
    if (pr === null) return usage({ cli })
    const { found, home } = await findStory({ cli, ...pr })
    if (found.status !== 'ok') {
        cli.err(
            `No usable story for ${pr.repo}#${pr.pr_number}: ${found.status}.`
        )
        return 1
    }
    const json = `${JSON.stringify(found.story, null, 2)}\n`
    const out_at = args.indexOf('--out')
    const out_path = out_at === -1 ? undefined : args[out_at + 1]
    if (out_path === undefined) cli.out(json)
    else await writeFile(out_path, json)
    cli.err(`Found in the ${home} home, written for ${found.story.head_sha}.`)
    return 0
}

const status = async ({ cli, args }: { cli: StoryCliEnv; args: string[] }) => {
    const pr = prArgs({ args })
    if (pr === null) return usage({ cli })
    const { found, home } = await findStory({ cli, ...pr })
    const now = await prNow({ gh: cli.gh, ...pr })
    const story_head_sha = found.status === 'ok' ? found.story.head_sha : null
    const state =
        found.status === 'none'
            ? 'none'
            : found.status !== 'ok'
              ? 'broken'
              : story_head_sha === now.head_sha
                ? 'fresh'
                : 'stale'
    if (state !== 'fresh' && now.labels.includes(REVIEW_READY_LABEL)) {
        await removeReadyLabel({ gh: cli.gh, ...pr })
    }
    cli.out(
        JSON.stringify({
            status: state,
            home: found.status === 'none' ? null : home,
            story_head_sha,
            pr_head_sha: now.head_sha,
        })
    )
    return 0
}

const usage = ({ cli }: { cli: StoryCliEnv }) => {
    cli.err(USAGE)
    return 2
}

/**
 * Runs one helper command. Never throws: a failed step prints its reason
 * and returns 2.
 *
 * @returns The exit code.
 * @example
 * await runStoryCli({ argv: ['check', 'story.json'], gh, home: homedir(), env: process.env, out: console.log, err: console.error })
 */
export const runStoryCli = async (cli: StoryCliEnv): Promise<number> => {
    const [command, ...args] = cli.argv
    try {
        if (command === 'check') {
            const [path] = args
            if (path === undefined) return usage({ cli })
            const story = await storyFromFile({ path, err: cli.err })
            if (story === null) return 1
            cli.out(
                `Valid story: ${story.stops.length} stops, schema_version ${story.schema_version}.`
            )
            return 0
        }
        if (command === 'home') {
            const [repo, ...flags] = args
            if (repo === undefined) return usage({ cli })
            const forced = forcedHome({ flags })
            const picked =
                forced === null
                    ? await defaultStoryHome({ gh: cli.gh, repo })
                    : { home: forced, why: 'forced by the flag' }
            cli.out(`${picked.home} (${picked.why})`)
            return 0
        }
        if (command === 'save') return await save({ cli, args })
        if (command === 'load') return await load({ cli, args })
        if (command === 'status') return await status({ cli, args })
        return usage({ cli })
    } catch (error) {
        cli.err(error instanceof Error ? error.message : String(error))
        return 2
    }
}
