import { mkdtemp, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { createFakeHost } from './fake-host'
import { createPretendGitHub, type PretendReview } from './pretend-github'
import { testGit } from './test-git'
import { makeCheckoutRepo, storyOf } from './walk-story'

import { savePrivateStory } from '../../../engine/src/story/story-store'
import { DraftsSchema, type Drafts } from '../drafts-file'
import { createWalkApp } from '../walk-app'

/**
 * The setup for the send tests (#761): a checkout of #12 of
 * `octocat/hello-world` under a fresh walk folder, its story, a pretend
 * GitHub and an app on it.
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

const linesOf = (changed: string) =>
    Array.from({ length: LINES }, (_, at) =>
        at + 1 === 10 ? changed : `const line${at + 1} = ${at + 1}`
    ).join('\n') + '\n'

export type SendRepo = {
    dir: string
    walk_dir: string
    checkout: string
    base_sha: string
    head_sha: string
}

/** A fresh temporary folder with the checkout of #12 in its walk folder. */
export const makeSendRepo = async (): Promise<SendRepo> => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-send-')))
    const walk_dir = join(dir, 'walk')
    const checkout = join(walk_dir, 'checkouts/octocat/hello-world/pr-12')
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
    return { dir, walk_dir, checkout, ...made }
}

/** The pull request's drafts file, as saved, parsed with its own schema. */
export const readSaved = async (repo: SendRepo): Promise<Drafts> =>
    DraftsSchema.parse(
        JSON.parse(
            await readFile(
                join(repo.walk_dir, 'drafts/octocat/hello-world/pr-12.json'),
                'utf8'
            )
        )
    )

/** The first line of a comment outside the diff, on the head side. */
export const outsideStart = (repo: SendRepo, line: string, path: string) =>
    `On line ${line} of ${path}, outside this pull request's diff: https://github.com/${REPO}/blob/${repo.head_sha}/${path}#L${line}`

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

/** A new app on the checkout of #12 by `author`, activated, and helpers. */
export const openSendApp = async (
    repo: SendRepo,
    {
        author = 'octocat',
        labels = [],
        repo_labels = [SIGNED_OFF, CHANGES_WANTED],
        reviews = [],
    }: {
        author?: string
        labels?: string[]
        repo_labels?: string[]
        reviews?: PretendReview[]
    } = {}
) => {
    const stories_dir = join(repo.dir, 'stories')
    await savePrivateStory({
        stories_dir,
        story: storyOf({
            repo: REPO,
            base_sha: repo.base_sha,
            head_sha: repo.head_sha,
            stops: [
                {
                    id: 's1',
                    title: 'The a file',
                    changes: [{ id: 'c1', path: 'src/a.ts', line: 10 }],
                },
            ],
        }),
    })
    const github = createPretendGitHub({
        login: 'octocat',
        labels: { [REPO]: repo_labels },
        pulls: [
            {
                repo: REPO,
                number: 12,
                title: 'Retry stuck tickets',
                author,
                base_ref: 'main',
                head_sha: repo.head_sha,
                state: 'OPEN',
                labels,
                comments: [],
                reviews,
                diff_hunks: [
                    { path: 'src/a.ts', side: 'RIGHT', ...HUNK },
                    { path: 'src/a.ts', side: 'LEFT', ...HUNK },
                ],
            },
        ],
    })
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
    const where = { repo: REPO, number: 12 }
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
        repo_labels_now: () => github.state.labels[REPO] ?? [],
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
        send: async (verdict: string | null) => {
            host.answers.push(verdict)
            await run('lucaWalk.sendReview')
        },
    }
}
