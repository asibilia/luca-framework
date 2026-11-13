import { z } from 'zod'

import { checkoutAtHead } from './checkout'
import { createFeedback, type Feedback } from './feedback'
import { readAgentSummaries, readGitHubThreads } from './github-conversation'
import { checkoutPath, type PullRequestRef } from './pull-request-ref'
import {
    filesToWalk,
    lastReviewOf,
    marksOnVisit,
    readVisit,
    type Visit,
} from './second-visit'
import type { Loaded } from './summary-html'
import type { WalkGit, WalkHost } from './walk-host'
import { createWalkSession, type WalkSession } from './walk-session'

import type { Gh } from '../../engine/src/story/story-github'
import { findStory } from '../../engine/src/story/story-pick'

/**
 * Loading a pull request (#752, sections 4, 12 and 13): GitHub's head,
 * read once, with the checkout brought there; the story; what changed
 * since the owner's last review; the conversation already on GitHub; the
 * owner's feedback; and the walk.
 */

export const messageOf = (thrown: unknown): string =>
    thrown instanceof Error ? thrown.message : String(thrown)

const PullViewSchema = z.object({
    number: z.number().int(),
    title: z.string(),
    author: z.object({ login: z.string() }),
    baseRefName: z.string(),
    headRefOid: z.string(),
    state: z.string(),
    url: z.string(),
})
export type PullView = z.infer<typeof PullViewSchema>

/** Reads `ref` with `gh pr view`; throws gh's error. */
export const readPullView = async ({
    gh,
    ref,
}: {
    gh: Gh
    ref: PullRequestRef
}): Promise<PullView> => {
    const view = await gh({
        args: [
            'pr',
            'view',
            String(ref.number),
            '--repo',
            ref.repo,
            '--json',
            'number,title,author,baseRefName,headRefOid,state,url',
        ],
    })
    if (!view.ok) throw new Error(view.stderr.trim() || 'gh failed')
    return PullViewSchema.parse(JSON.parse(view.stdout))
}

/** The head the app works at, and who opened the pull request against which branch. */
export type PullHead = { sha: string; author: string; base_ref: string }

/** The pull request on screen. */
export type Shown = {
    ref: PullRequestRef
    checkout: string
    loaded: Loaded
    /**
     * GitHub's head, which the checkout is at, for the walk, browsing,
     * sending and the record alike; null when the pull request could not
     * be read or the checkout could not be brought to its head.
     */
    head: PullHead | null
    story_requested: boolean
    /** `/luca-pr-address`'s summaries on it, newest first. */
    replies: string[]
    /** What changed since the owner's last review. */
    visit: Visit
    /** The walk through the story, or the plain diff once browsed. */
    walk: WalkSession | null
    /** The owner's unsent feedback on it. */
    feedback: Feedback
}

/** Loads `ref` from its checkout under `walk_dir`. */
export const loadPullRequest = async ({
    host,
    gh,
    git,
    walk_dir,
    stories_dir,
    remote_url,
    ref,
}: {
    host: WalkHost
    gh: Gh
    git: WalkGit
    walk_dir: string
    stories_dir: string
    remote_url: (where: { repo: string }) => string
    ref: PullRequestRef
}): Promise<Shown> => {
    const { repo, number: pr_number } = ref
    const checkout = checkoutPath({ walk_dir, ref })
    let loaded: Loaded
    let head: PullHead | null = null
    try {
        const pull = await readPullView({ gh, ref })
        const at = await checkoutAtHead({
            git,
            walk_dir,
            remote_url: remote_url({ repo }),
            ref,
            base_ref: pull.baseRefName,
            head_sha: pull.headRefOid,
        })
        if (!at.ok) throw new Error(at.error)
        head = {
            sha: pull.headRefOid,
            author: pull.author.login,
            base_ref: pull.baseRefName,
        }
        const { found } = await findStory({ gh, stories_dir, repo, pr_number })
        loaded = { status: 'found', found, head_sha: head.sha }
    } catch (thrown) {
        loaded = { status: 'failed', message: messageOf(thrown) }
    }
    const story =
        loaded.status === 'found' && loaded.found.status === 'ok'
            ? loaded.found.story
            : null
    const first: Visit = { kind: 'first' }
    const [github_threads, replies, visit] = await Promise.all([
        readGitHubThreads({ gh, ref }).catch(() => []),
        readAgentSummaries({ gh, ref }).catch(() => []),
        loaded.status === 'found'
            ? readVisit({
                  walk_dir,
                  gh,
                  git,
                  ref,
                  checkout,
                  head_sha: loaded.head_sha,
              }).catch(() => first)
            : first,
    ])
    let shown: Shown | null = null
    const feedback = await createFeedback({
        host,
        git,
        walk_dir,
        ref,
        checkout,
        base_sha: story?.base_sha ?? null,
        github_threads,
        onApprovedChanged: async () => {
            await shown?.walk?.showStops()
        },
    })
    await feedback.setApproved(
        await marksOnVisit({
            visit,
            git,
            checkout,
            head_sha: head?.sha ?? null,
            drafted: feedback.approvedFiles(),
            stored: feedback.approvedChecked(),
        })
    )
    const walk =
        story === null || story.head_sha !== head?.sha
            ? null
            : await createWalkSession({
                  host,
                  walk_dir,
                  ref,
                  checkout,
                  story,
                  looksGood: feedback.looksGood,
                  files_to_walk: filesToWalk({ visit }),
                  last_review: lastReviewOf({ visit }),
              })
    shown = {
        ref,
        checkout,
        loaded,
        head,
        story_requested: false,
        replies,
        visit,
        walk,
        feedback,
    }
    return shown
}
