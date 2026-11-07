import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { runDoctor } from './doctor'

import { createFakeMuninn } from '../testing/fake-muninn'
import {
    CONFIG_PATH,
    fakeGitHub,
    logs,
    makeRepo,
    printed,
    repo,
    root,
    setup,
    useSetupRepo,
} from '../testing/setup-repo'
import { RUN_LABELS } from '../tracker/tracker'

/**
 * `build_cache_paths` (#721) in `luca doctor` and `luca setup`: the repo
 * group's `build_cache` check warns about each path git doesn't ignore in
 * the checkout, since Luca never copies one. Both commands print it as
 * doctor prints its checks.
 */

useSetupRepo()

const WARNING_LINES = [
    "  WARNING `build_cache_paths` path cache isn't ignored by git, so Luca won't copy it.",
    '          Fix: Add cache to .gitignore.',
]

/** A repo whose config names `cache` as a build cache, with these files. */
const cacheRepo = async ({ files = {} }: { files?: Record<string, string> }) =>
    makeRepo({
        files: {
            [CONFIG_PATH]: JSON.stringify({
                checks: { test: 'bun test' },
                muninn: { vault: 'tmnb' },
                build_cache_paths: ['cache'],
            }),
            ...files,
        },
    })

/** Never running, never installed: only the repo's checks matter here. */
const down = async (): Promise<never> => {
    throw new Error('connect ECONNREFUSED 127.0.0.1:6767')
}

/** `luca doctor` in the repo, with nothing on the computer set up. */
const doctor = async () => {
    const home = join(root, 'home')
    const tmp_dir = join(root, 'tmp')
    await mkdir(home, { recursive: true })
    await mkdir(tmp_dir, { recursive: true })
    return runDoctor({
        home,
        fix: false,
        luca_version: '14.0.0-alpha.33',
        board_dir: join(home, 'luca', 'board'),
        skills_dir: join(home, 'luca', 'skills'),
        engine_path: join(home, 'luca', 'engine', 'cli', 'luca-run.ts'),
        bun_path: process.execPath,
        computer: {
            bunVersion: async () => null,
            claudeVersion: async () => null,
            ghLogin: async () => null,
            lucaCopies: async () => [],
        },
        muninn: {
            which: async () => null,
            install: down,
            run: down,
            token: async () => null,
        },
        muninn_health: async () => null,
        claude: {
            listMcpServers: async () => [],
            addMcpServer: down,
            removeMcpServer: down,
        },
        paseo: {
            version: down,
            boardVersion: down,
            pluginsEnabled: down,
            enablePlugins: down,
            listPlugins: down,
            installPlugin: down,
            reloadPlugin: down,
            removePlugin: down,
            readSettings: down,
            writeSettings: down,
        },
        repo: {
            path: repo,
            github: fakeGitHub({ labels: RUN_LABELS }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        },
        tmp_dir,
        env: {},
        log: (line) => {
            logs.push(line)
        },
    })
}

/** Whether `lines` holds `wanted` one after the other. */
const inOrder = ({
    lines,
    wanted,
}: {
    lines: string[]
    wanted: string[]
}): boolean =>
    lines.some((_, at) =>
        wanted.every((line, offset) => lines[at + offset] === line)
    )

describe('the build_cache check in doctor and setup (#721)', () => {
    test('luca doctor warns about a build cache path git does not ignore', async () => {
        await cacheRepo({})

        await doctor()

        expect(inOrder({ lines: logs, wanted: WARNING_LINES })).toBe(true)
    }, 60_000)

    test('luca setup prints the same warning', async () => {
        await cacheRepo({})

        const end = await setup({
            github: fakeGitHub({ labels: RUN_LABELS }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expect(
            inOrder({ lines: printed(end).split('\n'), wanted: WARNING_LINES })
        ).toBe(true)
    }, 60_000)

    test('luca doctor says OK when every build cache path is ignored', async () => {
        await cacheRepo({ files: { '.gitignore': 'cache\n' } })

        await doctor()

        expect(logs).toContain(
            '  OK      Each build_cache_paths path is ignored by git'
        )
    }, 60_000)
})
