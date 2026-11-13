import { mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createFakeHost } from './fake-host'
import {
    createPretendGitHub,
    type PretendComment,
    type PretendReview,
    type PretendThread,
} from './pretend-github'
import { testGit } from './test-git'
import { makeCheckoutRepo, storyOf } from './walk-story'

import { savePrivateStory } from '../../../engine/src/story/story-store'
import { DraftsSchema, type Drafts } from '../drafts-file'
import { createWalkApp } from '../walk-app'

/**
 * The setup for the send tests (#761): a checkout of #12 of
 * `octocat/hello-world` (or another repo, #766) under a fresh walk folder,
 * its story, a pretend GitHub signed in as `octocat` and an app on it.
 *
 * `src/a.ts` has 130 lines; only line 10 changes, so the diff's one hunk
 * holds lines 7 to 13 on both sides. `src/elsewhere.ts` is not in the diff.
 */

export const REPO = 'octocat/hello-world'
export const SIGNED_OFF = 'signed-off'
export const CHANGES_WANTED = 'changes-wanted'

const LINES = 130
const HUNK = { start: 7, end: 13 }
const ELSEWHERE = 'one\ntwo\nthree\n'

/** `src/a.ts` with line 10 as `changed`, and any line of `more` as given. */
const linesOf = (changed: string, more: Record<number, string> = {}) =>
    Array.from({ length: LINES }, (_, at) =>
        at + 1 === 10
            ? changed
            : (more[at + 1] ?? `const line${at + 1} = ${at + 1}`)
    ).join('\n') + '\n'

export type SendRepo = {
    /** The pull request's repo, `owner/name`. */
    repo_name: string
    dir: string
    walk_dir: string
    checkout: string
    base_sha: string
    head_sha: string
}

/**
 * A fresh temporary folder with the checkout of #12 of `repo_name` in its
 * walk folder.
 */
export const makeSendRepo = async ({
    repo_name = REPO,
}: { repo_name?: string } = {}): Promise<SendRepo> => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-send-')))
    const walk_dir = join(dir, 'walk')
    const checkout = join(walk_dir, 'checkouts', repo_name, 'pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: {
            'src/a.ts': linesOf('const line10 = 10'),
            'src/elsewhere.ts': ELSEWHERE,
        },
        head: {
            'src/a.ts': linesOf("const line10 = 'changed'"),
            'src/elsewhere.ts': ELSEWHERE,
        },
    })
    return { repo_name, dir, walk_dir, checkout, ...made }
}

/**
 * Moves `origin/main` on past the base (#759): one commit after the base
 * that changes line 100 of `src/a.ts` to `const line100 = main`. The merge
 * base of `origin/main` and the head is still the base, but a diff from
 * main's tip has a second hunk, around line 100. Leaves the checkout at
 * the head.
 *
 * @returns Main's new tip.
 */
export const moveMainOn = async (repo: SendRepo): Promise<string> => {
    const cwd = repo.checkout
    await testGit({ args: ['checkout', '-q', '--detach', repo.base_sha], cwd })
    await writeFile(
        join(cwd, 'src/a.ts'),
        linesOf('const line10 = 10', { 100: 'const line100 = main' })
    )
    await testGit({ args: ['commit', '-q', '-am', 'main moved on'], cwd })
    const tip = (
        await testGit({ args: ['rev-parse', 'HEAD'], cwd })
    ).stdout.trim()
    await testGit({
        args: ['update-ref', 'refs/remotes/origin/main', tip],
        cwd,
    })
    await testGit({ args: ['checkout', '-q', '--detach', repo.head_sha], cwd })
    return tip
}

/** The pull request's drafts file, as saved, parsed with its own schema. */
export const readSaved = async (repo: SendRepo): Promise<Drafts> =>
    DraftsSchema.parse(
        JSON.parse(
            await readFile(
                join(repo.walk_dir, 'drafts', repo.repo_name, 'pr-12.json'),
                'utf8'
            )
        )
    )

/** The first line of a comment outside the diff, on the head side. */
export const outsideStart = (repo: SendRepo, line: string, path: string) =>
    `On line ${line} of ${path}, outside this pull request's diff: https://github.com/${repo.repo_name}/blob/${repo.head_sha}/${path}#L${line}`

/** A pending review by `octocat`, id 77, holding `body`. */
export const pendingReview = (body: string): PretendReview => ({
    id: 77,
    node_id: 'PRR_77',
    author: 'octocat',
    state: 'PENDING',
    event: null,
    body,
    commit_id: 'f'.repeat(40),
    submitted_at: null,
    comments: [],
    file_threads: [],
})

/**
 * A new app on the checkout of #12 by `author`, activated, and helpers.
 *
 * @param story - The commits its private story was written for: the
 *   repo's base and head when left out, none when null.
 */
export const openSendApp = async (
    repo: SendRepo,
    {
        author = 'octocat',
        labels = [],
        repo_labels = [SIGNED_OFF, CHANGES_WANTED],
        reviews = [],
        story = { base_sha: repo.base_sha, head_sha: repo.head_sha },
        comments = [],
        threads = [],
        user_unreadable = false,
    }: {
        author?: string
        labels?: string[]
        repo_labels?: string[]
        reviews?: PretendReview[]
        story?: { base_sha: string; head_sha: string } | null
        /** The pull request's conversation comments. */
        comments?: PretendComment[]
        threads?: PretendThread[]
        /** gh can't say who is signed in when the pull request is opened. */
        user_unreadable?: boolean
    } = {}
) => {
    const repo_name = repo.repo_name
    const stories_dir = join(repo.dir, 'stories')
    if (story !== null) {
        await savePrivateStory({
            stories_dir,
            story: storyOf({
                repo: repo_name,
                ...story,
                stops: [
                    {
                        id: 's1',
                        title: 'The a file',
                        changes: [{ id: 'c1', path: 'src/a.ts', line: 10 }],
                    },
                ],
            }),
        })
    }
    const github = createPretendGitHub({
        login: 'octocat',
        labels: { [repo_name]: repo_labels },
        pulls: [
            {
                repo: repo_name,
                number: 12,
                title: 'Retry stuck tickets',
                author,
                base_ref: 'main',
                head_sha: repo.head_sha,
                state: 'OPEN',
                labels,
                comments,
                threads,
                reviews,
                diff_hunks: [
                    { path: 'src/a.ts', side: 'RIGHT', ...HUNK },
                    { path: 'src/a.ts', side: 'LEFT', ...HUNK },
                ],
            },
        ],
    })
    if (user_unreadable) {
        github.failNext({ step: 'read_user', error: 'gh: not logged in' })
    }
    const host = createFakeHost({ workspace_folder: repo.checkout })
    const app = createWalkApp({
        host,
        gh: github.gh,
        git: testGit,
        walk_dir: repo.walk_dir,
        stories_dir,
        remote_url: () => join(repo.dir, 'no-origin'),
    })
    await app.activated()
    const run = (command: string) => app.run({ command, args: [] })
    const where = { repo: repo_name, number: 12 }
    const uriOf = (path: string) =>
        pathToFileURL(join(repo.checkout, path)).href
    const reviews_now = () => github.reviewsOf(where)
    return {
        app,
        host,
        github,
        run,
        uriOf,
        reviews_now,
        submitted: () =>
            reviews_now().filter((review) => review.state !== 'PENDING'),
        labels_now: () => github.pull(where).labels,
        repo_labels_now: () => github.state.labels[repo_name] ?? [],
        lineDraft: (start_line: number, end_line: number, body: string) =>
            app.draftCommentAdded({
                uri: uriOf('src/a.ts'),
                start_line,
                end_line,
                body,
            }),
        elsewhereDraft: (body: string) =>
            app.draftCommentAdded({
                uri: uriOf('src/elsewhere.ts'),
                start_line: 3,
                end_line: 3,
                body,
            }),
        fileDraft: async (body: string) => {
            host.active_editor = {
                uri: uriOf('src/a.ts'),
                start_line: 1,
                end_line: 1,
            }
            host.answers.push(body)
            await run('lucaWalk.commentOnFile')
        },
        prDraft: async (body: string) => {
            host.answers.push(body)
            await run('lucaWalk.commentOnPullRequest')
        },
        approveA: async () => {
            host.active_editor = {
                uri: uriOf('src/a.ts'),
                start_line: 1,
                end_line: 1,
            }
            await run('lucaWalk.toggleLooksGood')
        },
        /**
         * Sends with `verdict`; `confirm` answers the modal question
         * before a real GitHub verdict (its button's label, or null).
         */
        send: async (verdict: string | null, confirm?: string | null) => {
            host.answers.push(verdict)
            if (confirm !== undefined) host.answers.push(confirm)
            await run('lucaWalk.sendReview')
        },
        /** Presses the Summary panel's button `id`. */
        press: (id: string) =>
            app.panelMessage({
                panel: 'summary',
                message: { type: 'button', id },
            }),
        /** The Summary panel's HTML. */
        summary: () => host.panels.summary?.html ?? '',
    }
}
