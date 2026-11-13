import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import type { PullRequestRef } from './pull-request-ref'

import type { Gh } from '../../engine/src/story/story-github'
import { prNow, REVIEW_READY_LABEL } from '../../engine/src/story/story-github'
import { loadPrivateStory } from '../../engine/src/story/story-store'

/**
 * The list of review-ready pull requests (#752, section 5): the open pull
 * requests the search finds that involve the owner, then the open pull
 * requests with a story in the private store, each listed once.
 */

/** One quick pick item, and the pull request it opens. */
export type ReviewReadyItem = {
    label: string
    description: string
    ref: PullRequestRef
}

const SearchSchema = z.array(
    z.object({
        number: z.number().int(),
        title: z.string(),
        repository: z.object({ nameWithOwner: z.string() }),
    })
)

const PRIVATE_STORY = /^pr-(\d+)\.json$/

/** The names in `dir`, or none when it can't be read. */
const namesIn = async (dir: string): Promise<string[]> => {
    try {
        return (await readdir(dir)).sort()
    } catch {
        return []
    }
}

const visible = (name: string) => !name.startsWith('.')

/** Every pull request with a story in the private store, by repo and number. */
const privateRefs = async ({
    stories_dir,
}: {
    stories_dir: string
}): Promise<PullRequestRef[]> => {
    const refs: PullRequestRef[] = []
    for (const owner of (await namesIn(stories_dir)).filter(visible)) {
        const owner_dir = join(stories_dir, owner)
        for (const name of (await namesIn(owner_dir)).filter(visible)) {
            for (const file of await namesIn(join(owner_dir, name))) {
                const number = Number(PRIVATE_STORY.exec(file)?.[1] ?? 0)
                if (number >= 1) refs.push({ repo: `${owner}/${name}`, number })
            }
        }
    }
    return refs.sort((a, b) =>
        a.repo === b.repo ? a.number - b.number : a.repo < b.repo ? -1 : 1
    )
}

/** Whether the pull request is open; one GitHub can't read counts as not. */
const isOpen = async ({
    gh,
    ref,
}: {
    gh: Gh
    ref: PullRequestRef
}): Promise<boolean> => {
    try {
        const { state } = await prNow({
            gh,
            repo: ref.repo,
            pr_number: ref.number,
        })
        return state === 'OPEN'
    } catch {
        return false
    }
}

/** The open review-ready pull requests that involve the signed-in user. */
const searched = async ({ gh }: { gh: Gh }): Promise<ReviewReadyItem[]> => {
    const search = await gh({
        args: [
            'search',
            'prs',
            '--state',
            'open',
            '--label',
            REVIEW_READY_LABEL,
            '--involves',
            '@me',
            '--json',
            'number,title,repository',
        ],
    })
    if (!search.ok) {
        throw new Error(
            `searching for review-ready pull requests: ${search.stderr.trim() || 'gh failed'}`
        )
    }
    return SearchSchema.parse(JSON.parse(search.stdout)).map(
        ({ number, title, repository }) => ({
            label: `#${number} ${title}`,
            description: repository.nameWithOwner,
            ref: { repo: repository.nameWithOwner, number },
        })
    )
}

/**
 * The quick pick's items: the search's results in its order, then the open
 * pull requests with a private story, by repo and number.
 *
 * @throws When the search fails.
 * @example
 * const items = await reviewReadyItems({ gh, stories_dir })
 */
export const reviewReadyItems = async ({
    gh,
    stories_dir,
}: {
    gh: Gh
    stories_dir: string
}): Promise<ReviewReadyItem[]> => {
    const items = await searched({ gh })
    const listed = (ref: PullRequestRef) =>
        items.some(
            (item) =>
                item.ref.repo === ref.repo && item.ref.number === ref.number
        )
    for (const ref of await privateRefs({ stories_dir })) {
        if (listed(ref)) continue
        if (!(await isOpen({ gh, ref }))) continue
        const read = await loadPrivateStory({
            stories_dir,
            repo: ref.repo,
            pr_number: ref.number,
        })
        items.push({
            label:
                read.status === 'ok'
                    ? `#${ref.number} ${read.story.title}`
                    : `#${ref.number}`,
            description: `${ref.repo} · private story`,
            ref,
        })
    }
    return items
}
