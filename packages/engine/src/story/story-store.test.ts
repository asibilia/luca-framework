import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    loadPrivateStory,
    privateStoryPath,
    removePrivateStory,
    savePrivateStory,
    storiesDir,
} from './story-store'
import { sha, story } from './testing/story-fixtures'

let stories_dir = ''

beforeEach(async () => {
    stories_dir = await mkdtemp(join(tmpdir(), 'luca-stories-'))
})

afterEach(async () => {
    await rm(stories_dir, { recursive: true, force: true })
})

describe('the private story store', () => {
    test('a saved story is one file per PR, reads back, and a later save replaces it', async () => {
        const path = await savePrivateStory({ stories_dir, story: story() })
        expect(path).toBe(join(stories_dir, 'acme', 'site', 'pr-12.json'))
        const pr = { stories_dir, repo: 'acme/site', pr_number: 12 }
        expect(await loadPrivateStory(pr)).toEqual({
            status: 'ok',
            story: story(),
        })

        const newer = { ...story(), head_sha: sha({ char: 'c' }) }
        await savePrivateStory({ stories_dir, story: newer })
        expect(await loadPrivateStory(pr)).toEqual({
            status: 'ok',
            story: newer,
        })
        expect(await readdir(join(stories_dir, 'acme', 'site'))).toEqual([
            'pr-12.json',
        ])
    })

    test('a PR with no story is none, and a broken file is invalid, not a crash', async () => {
        const pr = { stories_dir, repo: 'acme/site', pr_number: 12 }
        expect(await loadPrivateStory(pr)).toEqual({ status: 'none' })

        await savePrivateStory({ stories_dir, story: story() })
        await writeFile(privateStoryPath(pr), '{ not json')
        expect((await loadPrivateStory(pr)).status).toBe('invalid')
    })

    test('the folder is next to the runs folder unless LUCA_STORIES_DIR says otherwise, and a repo name cannot leave it', () => {
        expect(storiesDir({ home: '/Users/me', env: {} })).toBe(
            '/Users/me/.local/state/luca/stories'
        )
        expect(
            storiesDir({
                home: '/Users/me',
                env: { LUCA_STORIES_DIR: '/tmp/s' },
            })
        ).toBe('/tmp/s')
        for (const repo of [
            '../../etc',
            'acme',
            'acme/../x',
            'acme/site/extra',
            './site',
        ]) {
            expect(() =>
                privateStoryPath({ stories_dir, repo, pr_number: 1 })
            ).toThrow()
        }
    })

    test('a removed story is gone, and removing a missing one is not an error', async () => {
        const pr = { stories_dir, repo: 'acme/site', pr_number: 12 }
        expect(await removePrivateStory(pr)).toBe(false)
        await savePrivateStory({ stories_dir, story: story() })
        expect(await removePrivateStory(pr)).toBe(true)
        expect(await loadPrivateStory(pr)).toEqual({ status: 'none' })
        expect(await removePrivateStory(pr)).toBe(false)
    })
})
