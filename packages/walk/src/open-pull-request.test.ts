import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createFakeHost } from './testing/fake-host'
import { createPretendGitHub } from './testing/pretend-github'
import { testGit } from './testing/test-git'
import { createWalkApp } from './walk-app'

/**
 * `Open pull request` (#753) when the answer can't name a pull request.
 * The checkouts it makes are in `open-pull-request.e2e.test.ts`, with a
 * real git repo.
 */

let dir = ''

beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'luca-walk-open-')))
})

afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
})

/** Runs `Open pull request` in a window with no folder, answering `answer`. */
const openWith = async ({ answer }: { answer: string }) => {
    const host = createFakeHost({ workspace_folder: null })
    host.answers.push(answer)
    const app = createWalkApp({
        host,
        gh: createPretendGitHub({ login: 'octocat', pulls: [] }).gh,
        git: testGit,
        walk_dir: join(dir, 'walk'),
        stories_dir: join(dir, 'stories'),
        remote_url: () => join(dir, 'no-origin'),
    })
    await app.run({ command: 'lucaWalk.openPullRequest', args: [] })
    return host
}

describe('opening a pull request by an answer that names none (#753)', () => {
    test("a bare number in a window with no folder asks for the pull request's URL", async () => {
        const host = await openWith({ answer: '12' })

        expect(host.prompts).toContain('Pull request number or URL')
        expect(host.messages).toContainEqual({
            kind: 'error',
            text: "Give the pull request's URL: this window has no GitHub repo to read a number against.",
        })
        expect(host.folders).toEqual([])
    })

    test('an answer that is neither a number nor a URL is refused', async () => {
        const host = await openWith({ answer: 'twelve' })

        expect(host.messages).toContainEqual({
            kind: 'error',
            text: 'That is not a pull request number or URL.',
        })
        expect(host.folders).toEqual([])
    })
})
