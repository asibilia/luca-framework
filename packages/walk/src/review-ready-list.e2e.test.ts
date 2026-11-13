import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
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
 * Picking from the list of review-ready pull requests with real git (#755):
 * the pick opens the pull request's checkout like `Open pull request`.
 */

setDefaultTimeout(30_000)

let dir = ''

const git = async (cwd: string, ...args: string[]): Promise<string> => {
    const done = await testGit({ args, cwd })
    if (!done.ok) throw new Error(`git ${args.join(' ')}: ${done.stderr}`)
    return done.stdout.trim()
}

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-pick-')))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

describe('picking a review-ready pull request (#755)', () => {
    test('picking #12 makes its checkout under walk_dir and opens that folder', async () => {
        const origin = join(dir, 'origin')
        const walk_dir = join(dir, 'walk')
        await mkdir(origin)
        await git(origin, 'init', '-q', '-b', 'main')
        await writeFile(join(origin, 'src.ts'), 'export const a = 1\n')
        await git(origin, 'add', '-A')
        await git(origin, 'commit', '-q', '-m', 'first')
        await git(origin, 'checkout', '-q', '-b', 'feature')
        await writeFile(join(origin, 'src.ts'), 'export const a = 2\n')
        await git(origin, 'commit', '-q', '-am', 'change')
        const head = await git(origin, 'rev-parse', 'HEAD')
        await git(origin, 'update-ref', 'refs/pull/12/head', head)
        await git(origin, 'checkout', '-q', 'main')
        const github = createPretendGitHub({
            login: 'octocat',
            pulls: [
                {
                    repo: 'octocat/hello-world',
                    number: 12,
                    title: 'Add retries',
                    author: 'octocat',
                    base_ref: 'main',
                    head_sha: head,
                    state: 'OPEN',
                    labels: ['review-ready'],
                    comments: [],
                },
            ],
        })
        const host = createFakeHost({ workspace_folder: null })
        const app = createWalkApp({
            host,
            gh: github.gh,
            git: testGit,
            walk_dir,
            stories_dir: join(dir, 'stories'),
            remote_url: () => origin,
        })
        host.answers.push('#12 Add retries')

        await app.run({ command: 'lucaWalk.openFromList', args: [] })

        const checkout = join(
            walk_dir,
            'checkouts',
            'octocat',
            'hello-world',
            'pr-12'
        )
        expect(await git(checkout, 'rev-parse', 'HEAD')).toBe(head)
        expect(host.folders).toContain(checkout)
    })
})
