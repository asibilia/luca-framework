import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { RELOADED_FIELDS } from './config-reload'
import { loadEngineConfig } from './engine-config'

/**
 * `build_cache_paths` (#721): the build-cache folders a new ticket worktree
 * gets cloned in from a warm copy. Read from `.luca/config.json`, and taken
 * again on a resume.
 */

const REFUSED =
    'each build_cache_paths entry must be a path or glob inside the repo, relative to its root: not empty, not an absolute path, not the repo root, and not one that leaves the repo with ".."'

let repoRoot = ''

beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'luca-build-cache-paths-'))
})

afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true })
})

const loadWith = async ({ extra }: { extra: object }) => {
    await mkdir(join(repoRoot, '.luca'), { recursive: true })
    await writeFile(
        join(repoRoot, '.luca', 'config.json'),
        JSON.stringify({ checks: { test: 'bun test' }, ...extra })
    )
    return loadEngineConfig({ repo_root: repoRoot })
}

describe('build_cache_paths (#721)', () => {
    test('left out, it is empty, and a resume takes it again', async () => {
        expect(await loadWith({ extra: {} })).toMatchObject({
            ok: true,
            config: { build_cache_paths: [] },
        })
        const reloaded: string[] = [...RELOADED_FIELDS]
        expect(reloaded).toContain('build_cache_paths')
    })

    test('a trailing slash is dropped', async () => {
        expect(
            await loadWith({ extra: { build_cache_paths: ['cache/'] } })
        ).toMatchObject({ ok: true, config: { build_cache_paths: ['cache'] } })
    })

    test('an empty, absolute, repo root or climbing entry is refused', async () => {
        const refused: { entry: string; ok: boolean; error: string }[] = []
        for (const entry of ['', '/tmp/cache', '.', '../cache']) {
            const loaded = await loadWith({
                extra: { build_cache_paths: [entry] },
            })
            refused.push({
                entry,
                ok: loaded.ok,
                error: loaded.ok ? '' : loaded.error,
            })
        }

        expect(refused.map(({ entry, ok }) => ({ entry, ok }))).toEqual([
            { entry: '', ok: false },
            { entry: '/tmp/cache', ok: false },
            { entry: '.', ok: false },
            { entry: '../cache', ok: false },
        ])
        for (const { error } of refused) expect(error).toContain(REFUSED)
    })
})
