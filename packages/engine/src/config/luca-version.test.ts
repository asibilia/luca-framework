import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { DEV_VERSION, lucaVersion } from './luca-version'

/**
 * Luca's own version (#460): the version of the installed
 * `@alecsibilia/luca` package, found from the engine's own files by walking
 * up from them. Run from the repo's source (not an install), it is a clear
 * dev value.
 */

const dirs: string[] = []

afterEach(async () => {
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

const tempDir = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-version-'))
    dirs.push(dir)
    return dir
}

/**
 * A global install as `bun add -g @alecsibilia/luca` lays it out: the
 * package's manifest at its root, the engine's source under `engine/`.
 *
 * @returns The folder of the installed engine's `config/` source.
 */
const installed = async ({ version }: { version: string }) => {
    const root = join(await tempDir(), 'node_modules', '@alecsibilia', 'luca')
    await mkdir(join(root, 'engine', 'config'), { recursive: true })
    await Bun.write(
        join(root, 'package.json'),
        JSON.stringify({ name: '@alecsibilia/luca', version })
    )
    return join(root, 'engine', 'config')
}

describe("Luca's version", () => {
    test('an installed @alecsibilia/luca reports its package version', async () => {
        const dir = await installed({ version: '14.0.0-alpha.3' })

        expect(lucaVersion({ dir })).toBe('14.0.0-alpha.3')
    })

    test('another installed version reports that version', async () => {
        const dir = await installed({ version: '14.2.1' })

        expect(lucaVersion({ dir })).toBe('14.2.1')
    })

    test("the engine run from the repo's source reports the dev value", () => {
        expect(lucaVersion()).toBe(DEV_VERSION)
    })

    test('a folder with no @alecsibilia/luca package above it reports the dev value', async () => {
        const root = await tempDir()
        await mkdir(join(root, 'src', 'config'), { recursive: true })
        await Bun.write(
            join(root, 'package.json'),
            JSON.stringify({ name: '@luca/engine', version: '0.0.0' })
        )

        expect(lucaVersion({ dir: join(root, 'src', 'config') })).toBe(
            DEV_VERSION
        )
    })

    test('the dev value says dev, and is not 0.0.0', () => {
        expect(DEV_VERSION).toContain('dev')
        expect(DEV_VERSION).not.toBe('0.0.0')
    })
})
