import {
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    setDefaultTimeout,
    test,
} from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { createWalkApp } from './walk-app'

/**
 * `Open pull request` with real git (#753): Luca Walk's own clone and
 * the pull request's checkout under `walk_dir`, made from a local
 * "origin" repo that has a `refs/pull/12/head` ref, and never a change to
 * the window's own clone.
 */

setDefaultTimeout(30_000)

const REPO = 'octocat/hello-world'
const URL_12 = 'https://github.com/octocat/hello-world/pull/12'
const NOT_COMMITTED = 'The checkout for #12 has changes that are not committed.'

let dir = ''
let origin = ''
let walk_dir = ''
let clone = ''
let checkout = ''
let first_head = ''

const git = async (cwd: string, ...args: string[]): Promise<string> => {
    const done = await testGit({ args, cwd })
    if (!done.ok) throw new Error(`git ${args.join(' ')}: ${done.stderr}`)
    return done.stdout.trim()
}

const commitAll = async (cwd: string, message: string) => {
    await git(cwd, 'add', '-A')
    await git(cwd, 'commit', '-q', '-m', message)
    return git(cwd, 'rev-parse', 'HEAD')
}

/** Adds a commit to the pull request's branch and moves `refs/pull/12/head` to it. */
const movePullHead = async (text: string): Promise<string> => {
    await git(origin, 'checkout', '-q', 'feature')
    await writeFile(join(origin, 'src.ts'), text)
    const head = await commitAll(origin, `pull request: ${text.trim()}`)
    await git(origin, 'update-ref', 'refs/pull/12/head', head)
    await git(origin, 'checkout', '-q', 'main')
    return head
}

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-e2e-')))
    origin = join(dir, 'origin')
    walk_dir = join(dir, 'walk')
    clone = join(walk_dir, 'repos', 'octocat', 'hello-world')
    checkout = join(walk_dir, 'checkouts', 'octocat', 'hello-world', 'pr-12')
    await mkdir(origin)
    await git(origin, 'init', '-q', '-b', 'main')
    await writeFile(join(origin, 'README.md'), 'hello\n')
    await writeFile(join(origin, 'src.ts'), 'export const a = 1\n')
    await commitAll(origin, 'first')
    await git(origin, 'branch', 'feature')
    first_head = await movePullHead('export const a = 2\n')
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** A clone of the origin, as the owner's own working copy, whose `origin` is `origin_url`. */
const ownClone = async (origin_url: string): Promise<string> => {
    const own = join(dir, 'own')
    await git(dir, 'clone', '-q', origin, own)
    await git(own, 'remote', 'set-url', 'origin', origin_url)
    return own
}

/** An app whose window shows `workspace_folder`; GitHub's #12 is at `first_head`. */
const setUp = ({ workspace_folder }: { workspace_folder: string | null }) => {
    const github = createPretendGitHub({
        login: 'octocat',
        pulls: [
            {
                repo: REPO,
                number: 12,
                title: 'Make a two',
                author: 'octocat',
                base_ref: 'main',
                head_sha: first_head,
                state: 'OPEN',
                labels: [],
                comments: [],
            },
        ],
    })
    const host = createFakeHost({ workspace_folder })
    const app = createWalkApp({
        host,
        gh: github.gh,
        git: testGit,
        walk_dir,
        stories_dir: join(dir, 'stories'),
        remote_url: ({ repo }: { repo: string }) =>
            repo === REPO ? origin : join(dir, 'no-such-repo'),
    })
    const open = async (answer: string) => {
        host.answers.push(answer)
        await app.run({ command: 'lucaWalk.openPullRequest', args: [] })
    }
    /** Moves #12's head on the origin and on the pretend GitHub. */
    const moveHead = async (text: string) => {
        const moved = await movePullHead(text)
        github.pull({ repo: REPO, number: 12 }).head_sha = moved
        return moved
    }
    return { host, open, moveHead }
}

/** Expects the checkout of #12: a detached worktree of Luca Walk's clone at `head`. */
const expectCheckoutAt = async (head: string) => {
    expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(head)
    const branch = await testGit({
        args: ['symbolic-ref', '-q', 'HEAD'],
        cwd: checkout,
    })
    expect(branch.ok).toBe(false)
    const worktrees = await git(clone, 'worktree', 'list', '--porcelain')
    expect(worktrees.split('\n')).toContain(`worktree ${checkout}`)
}

describe('opening a pull request into its own checkout (#753)', () => {
    test('a number in a clone of octocat/hello-world makes the clone and a detached worktree at the head, and opens it', async () => {
        const own = await ownClone('https://github.com/octocat/hello-world')
        const { host, open } = setUp({ workspace_folder: own })

        await open('12')

        await expectCheckoutAt(first_head)
        expect(host.folders).toContain(checkout)
    })

    test('a pull request URL in a window with no folder makes the same checkout', async () => {
        const { host, open } = setUp({ workspace_folder: null })

        await open(URL_12)

        await expectCheckoutAt(first_head)
        expect(host.folders).toContain(checkout)
    })

    test("' #12 ' in a clone whose origin is git@github.com:octocat/hello-world.git makes the checkout of #12", async () => {
        const own = await ownClone('git@github.com:octocat/hello-world.git')
        const { host, open } = setUp({ workspace_folder: own })

        await open(' #12 ')

        await expectCheckoutAt(first_head)
        expect(host.folders).toContain(checkout)
    })

    test('opening again after the head moved moves the checkout to the new head', async () => {
        const { open, moveHead } = setUp({ workspace_folder: null })
        await open(URL_12)
        await expectCheckoutAt(first_head)

        const moved = await moveHead('export const a = 3\n')
        await open(URL_12)

        await expectCheckoutAt(moved)
    })

    test('a checkout with changes that are not committed is never moved, and the error says so', async () => {
        const { host, open, moveHead } = setUp({ workspace_folder: null })
        await open(URL_12)
        await writeFile(join(checkout, 'README.md'), 'my own edit\n')

        await moveHead('export const a = 3\n')
        await open(URL_12)

        expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(first_head)
        expect(await readFile(join(checkout, 'README.md'), 'utf8')).toBe(
            'my own edit\n'
        )
        const errors = host.messages.filter(({ kind }) => kind === 'error')
        expect(errors.some(({ text }) => text.startsWith(NOT_COMMITTED))).toBe(
            true
        )
    })

    test("the window's own clone stays on main with no changed files", async () => {
        const own = await ownClone('https://github.com/octocat/hello-world.git')
        const { host, open } = setUp({ workspace_folder: own })

        await open('12')

        expect(host.folders).toContain(checkout)
        expect(await git(own, 'symbolic-ref', '--short', 'HEAD')).toBe('main')
        expect(await git(own, 'status', '--porcelain')).toBe('')
    })
})
