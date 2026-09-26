import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

/** Luca's own bunfig, next to `luca-run.ts`, where the board points `--config`. */
const BUNFIG_PATH = join(import.meta.dir, 'bunfig.toml')

const dirs: string[] = []

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

describe('Luca’s own bunfig', () => {
    test('it ships next to luca-run.ts in the engine’s source', () => {
        expect(existsSync(join(import.meta.dir, 'luca-run.ts'))).toBe(true)
        expect(existsSync(BUNFIG_PATH)).toBe(true)
    })

    test('it preloads nothing', async () => {
        expect(existsSync(BUNFIG_PATH)).toBe(true)
        const text = await Bun.file(BUNFIG_PATH).text()

        expect(text).not.toMatch(/^\s*preload\s*=/m)
    })

    test('bun started with --no-env-file and it, in a repo with .env and a preload, loads neither', async () => {
        expect(existsSync(BUNFIG_PATH)).toBe(true)
        const repo = await mkdtemp(join(tmpdir(), 'luca-bunfig-repo-'))
        dirs.push(repo)
        const marker = join(repo, 'preload-ran')
        await Bun.write(join(repo, '.env'), 'LUCA_REPO_SECRET=from-the-repo\n')
        await Bun.write(
            join(repo, 'preload.ts'),
            `await Bun.write(${JSON.stringify(marker)}, 'ran')\n`
        )
        await Bun.write(
            join(repo, 'bunfig.toml'),
            'preload = ["./preload.ts"]\n'
        )
        await Bun.write(
            join(repo, 'probe.ts'),
            'console.log(JSON.stringify({ secret: process.env.LUCA_REPO_SECRET ?? null }))\n'
        )

        const result = Bun.spawnSync({
            cmd: [
                process.execPath,
                '--no-env-file',
                `--config=${BUNFIG_PATH}`,
                join(repo, 'probe.ts'),
            ],
            cwd: repo,
            env: Object.fromEntries(
                Object.entries(process.env).filter(
                    ([name]) => name !== 'LUCA_REPO_SECRET'
                )
            ),
        })

        expect(result.exitCode).toBe(0)
        expect(JSON.parse(result.stdout.toString().trim())).toEqual({
            secret: null,
        })
        expect(existsSync(marker)).toBe(false)
    })
})
