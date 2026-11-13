import { z } from 'zod'

import { checkoutAtHead } from './checkout'
import { CommitIdSchema } from './commit-id'
import { createFeedback, type Feedback } from './feedback'
import {
    agentReplies,
    readGitHubThreads,
    type Reply,
} from './github-conversation'
import { findOwnStory, type PullComment } from './own-story'
import { checkoutPath, type PullRequestRef } from './pull-request-ref'
import {
    filesToWalk,
    lastReviewOf,
    marksOnVisit,
    readVisit,
    type Visit,
} from './second-visit'
import { readLogin } from './signed-in'
import type { Loaded } from './summary-html'
import type { WalkGit, WalkHost } from './walk-host'
import { createWalkSession, type WalkSession } from './walk-session'

import { isOwnRepo, type Gh } from '../../engine/src/story/story-github'
import type { Story } from '../../engine/src/story/story-schema'

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
    let read: unknown
    try {
        read = JSON.parse(view.stdout)
    } catch {
        throw new Error(`gh answered something else: ${view.stdout.trim()}`)
    }
    const parsed = PullViewSchema.safeParse(read)
    if (!parsed.success) {
        throw new Error(`gh answered something else: ${view.stdout.trim()}`)
    }
    // The head is given to git: never anything but a commit id.
    const head = parsed.data.headRefOid
    if (!CommitIdSchema.safeParse(head).success) {
        throw new Error(
            `GitHub gave "${head}" as the head of #${ref.number}, which is not a commit id.`
        )
    }
    return parsed.data
}

/**
 * The commit the diff's base side is read at, by the walk, browsing, the
 * drafts and the send alike: the story's base when the story is for the
 * head, else the merge base of `origin/<base branch>` and the head, which
 * the plain diff shows. `ok` false holds git's error when it can't be read.
 */
export type DiffBase = { ok: true; sha: string } | { ok: false; error: string }

/** The head the app works at, who opened the pull request, and the diff's base. */
export type PullHead = { sha: string; author: string; base: DiffBase }

/** The diff's base of a pull request at `head_sha`; `story` is the one written for that head. */
const diffBaseOf = async ({
    git,
    checkout,
    base_ref,
    head_sha,
    story,
}: {
    git: WalkGit
    checkout: string
    base_ref: string
    head_sha: string
    story: Story | null
}): Promise<DiffBase> => {
    if (story !== null) return { ok: true, sha: story.base_sha }
    const merged = await git({
        args: ['merge-base', `origin/${base_ref}`, head_sha],
        cwd: checkout,
    })
    return merged.ok
        ? { ok: true, sha: merged.stdout.trim() }
        : { ok: false, error: merged.stderr.trim() || 'git failed' }
}

/** The pull request on screen. */
export type Shown = {
    ref: PullRequestRef
    checkout: string
    /** The signed-in user, read once on loading; null when gh could not say. */
    login: string | null
    /** The repo is the signed-in user's own (#766, `isOwnRepo`). */
    your_repo: boolean
    loaded: Loaded
    /**
     * GitHub's head, which the checkout is at, and the diff's base, for
     * the walk, browsing, the drafts, sending and the record alike; null
     * when the pull request could not be read or the checkout could not
     * be brought to its head.
     */
    head: PullHead | null
    story_requested: boolean
    /** Why a story on the pull request is not used (#766); null when none is left out. */
    story_note: string | null
    /** `/luca-pr-address`'s summaries on it, and look-alikes by others, newest first. */
    replies: Reply[]
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
    const { repo } = ref
    const checkout = checkoutPath({ walk_dir, ref })
    const login = await readLogin({ gh })
    let loaded: Loaded
    /** The pull request, once the checkout is at its head. */
    let pull: PullView | null = null
    let story_note: string | null = null
    let comments: PullComment[] | null = null
    try {
        const view = await readPullView({ gh, ref })
        const at = await checkoutAtHead({
            git,
            walk_dir,
            remote_url: remote_url({ repo }),
            ref,
            base_ref: view.baseRefName,
            head_sha: view.headRefOid,
        })
        if (!at.ok) throw new Error(at.error)
        pull = view
        const own = await findOwnStory({ gh, stories_dir, ref, login })
        story_note = own.note
        comments = own.comments
        const { found } = own
        loaded = { status: 'found', found, head_sha: view.headRefOid }
    } catch (thrown) {
        loaded = { status: 'failed', message: messageOf(thrown) }
    }
    const found_story =
        loaded.status === 'found' && loaded.found.status === 'ok'
            ? loaded.found.story
            : null
    /** The story, when it was written for the head: only then is it walked. */
    const story =
        found_story !== null && found_story.head_sha === pull?.headRefOid
            ? found_story
            : null
    const first: Visit = { kind: 'first' }
    const replies = agentReplies({ comments: comments ?? [], login })
    const [github_threads, visit, base] = await Promise.all([
        readGitHubThreads({ gh, ref, login }).catch(() => []),
        loaded.status === 'found'
            ? readVisit({
                  walk_dir,
                  gh,
                  git,
                  ref,
                  checkout,
                  head_sha: loaded.head_sha,
                  login,
              }).catch(() => first)
            : first,
        pull === null
            ? null
            : diffBaseOf({
                  git,
                  checkout,
                  base_ref: pull.baseRefName,
                  head_sha: pull.headRefOid,
                  story,
              }),
    ])
    const head: PullHead | null =
        pull === null || base === null
            ? null
            : { sha: pull.headRefOid, author: pull.author.login, base }
    let shown: Shown | null = null
    const feedback = await createFeedback({
        host,
        git,
        walk_dir,
        ref,
        checkout,
        base_sha: base?.ok ? base.sha : null,
        head_sha: head?.sha ?? null,
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
        story === null
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
        login,
        your_repo: isOwnRepo({ repo, login }),
        loaded,
        head,
        story_requested: false,
        story_note,
        replies,
        visit,
        walk,
        feedback,
    }
    return shown
}
