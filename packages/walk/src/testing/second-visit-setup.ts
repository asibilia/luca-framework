import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHost, type FakeHost } from './fake-host'
import { createPretendGitHub, type PretendReview } from './pretend-github'
import { testGit } from './test-git'
import { makeCheckoutRepo, storyOf, type StopAt } from './walk-story'

import { savePrivateStory } from '../../../engine/src/story/story-store'
import { createWalkApp } from '../walk-app'

/**
 * The setup for the second-visit tests (#762, spec #752 section 12): a
 * checkout of #12 of `octocat/hello-world` with three commits on its
 * branch: the base, `C1` (changes `src/a.ts`, `src/b.ts`, `src/c.ts`) and
 * `C2` (changes only the files the test names), plus `gone`, a commit
 * that is not in the branch's history. The story is written for `C2`.
 */

export const REPO = 'octocat/hello-world'

const FILES = ['src/a.ts', 'src/b.ts', 'src/c.ts']

const textOf = (path: string, version: string) =>
    `export const name = '${path}'\nexport const version = '${version}'\n`

const filesAt = (version: string, only: string[] = FILES) =>
    Object.fromEntries(
        FILES.map((path) => [
            path,
            textOf(path, only.includes(path) ? version : 'c1'),
        ])
    )

export type VisitRepo = {
    dir: string
    walk_dir: string
    checkout: string
    base_sha: string
    c1: string
    c2: string
    gone: string
}

const rev = async (cwd: string, what: string) =>
    (await testGit({ args: ['rev-parse', what], cwd })).stdout.trim()

/**
 * A fresh temporary folder with the checkout of #12 at `C2`, where `C2`
 * changes only `changed` since `C1`.
 */
export const makeVisitRepo = async ({
    changed,
}: {
    changed: string[]
}): Promise<VisitRepo> => {
    const dir = await realpath(
        await mkdtemp(join(tmpdir(), 'luca-walk-visit-'))
    )
    const walk_dir = join(dir, 'walk')
    const checkout = join(walk_dir, 'checkouts/octocat/hello-world/pr-12')
    const made = await makeCheckoutRepo({
        folder: checkout,
        base: Object.fromEntries(
            FILES.map((path) => [path, textOf(path, 'base')])
        ),
        head: filesAt('c1'),
    })
    const c1 = made.head_sha
    for (const [path, text] of Object.entries(filesAt('c2', changed))) {
        await writeFile(join(checkout, path), text)
    }
    await testGit({ args: ['add', '-A'], cwd: checkout })
    await testGit({ args: ['commit', '-q', '-m', 'c2'], cwd: checkout })
    const c2 = await rev(checkout, 'HEAD')
    const gone = (
        await testGit({
            args: [
                'commit-tree',
                `${c1}^{tree}`,
                '-p',
                made.base_sha,
                '-m',
                'force pushed away',
            ],
            cwd: checkout,
        })
    ).stdout.trim()
    // The base is on main, so browsing the plain diff starts from it.
    await testGit({
        args: ['update-ref', 'refs/remotes/origin/main', made.base_sha],
        cwd: checkout,
    })
    return { dir, walk_dir, checkout, base_sha: made.base_sha, c1, c2, gone }
}

/** One stop per file: `src/a.ts`, `src/b.ts`, `src/c.ts`. */
export const THREE_STOPS: StopAt[] = FILES.map((path, at) => ({
    id: `s${at + 1}`,
    title: `The ${path} stop`,
    changes: [{ id: `c${at + 1}`, path, line: 1 }],
}))

/** Writes the local review record of #12. */
export const writeLocalRecord = async (
    repo: VisitRepo,
    record: unknown
): Promise<void> => {
    const folder = join(repo.walk_dir, 'reviewed/octocat/hello-world')
    await mkdir(folder, { recursive: true })
    await writeFile(join(folder, 'pr-12.json'), JSON.stringify(record))
}

/** A submitted review by `octocat` on #12 whose text is `body`. */
export const submittedReview = (body: string, id = 51): PretendReview => ({
    id,
    node_id: `PRR_${id}`,
    author: 'octocat',
    state: 'COMMENTED',
    event: 'COMMENT',
    body,
    commit_id: 'f'.repeat(40),
    submitted_at: '2026-11-10T12:00:00Z',
    comments: [],
    file_threads: [],
})

/**
 * A new app on the checkout of #12 whose story has `stops`. The pull
 * request's head, and the commit the story is written for, is `head`
 * (`C2` unless the test names another). With `with_story` false, the
 * pull request has no story.
 */
export const openVisitApp = async (
    repo: VisitRepo,
    {
        stops = THREE_STOPS,
        reviews = [],
        head = repo.c2,
        with_story = true,
    }: {
        stops?: StopAt[]
        reviews?: PretendReview[]
        head?: string
        with_story?: boolean
    } = {}
): Promise<{
    host: FakeHost
    run: (command: string) => Promise<void>
    /** Presses the Summary panel's button `id`, such as `browse_diff`. */
    press: (id: string) => Promise<void>
    descriptions: () => string[]
    summary: () => string
}> => {
    const stories_dir = join(repo.dir, 'stories')
    if (with_story) {
        await savePrivateStory({
            stories_dir,
            story: storyOf({
                repo: REPO,
                base_sha: repo.base_sha,
                head_sha: head,
                stops,
            }),
        })
    }
    const github = createPretendGitHub({
        login: 'octocat',
        pulls: [
            {
                repo: REPO,
                number: 12,
                title: 'Retry stuck tickets',
                author: 'octocat',
                base_ref: 'main',
                head_sha: head,
                state: 'OPEN',
                labels: [],
                comments: [],
                reviews,
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
    return {
        host,
        run: (command) => app.run({ command, args: [] }),
        press: (id) =>
            app.panelMessage({
                panel: 'summary',
                message: { type: 'button', id },
            }),
        descriptions: () => host.stops.map(({ description }) => description),
        summary: () => host.panels.summary?.html ?? '',
    }
}
