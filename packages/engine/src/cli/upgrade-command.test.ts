import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { findNewInstall, handOff, parseUpgradeArgs } from './upgrade-command'

/**
 * `luca upgrade`'s hand-off to the new install (#529), with a throwaway
 * Bun global folder: a commands folder whose `luca` links into an
 * installed package, as `bun add -g` leaves them.
 */

const PACKAGE = '@alecsibilia/luca'

let root = ''
/** Bun's global commands folder. */
let bin_dir = ''
/** The installed package's folder. */
let package_dir = ''
/** The installed package's `luca` entry. */
let entry = ''

/** Installs a fake Luca `version`, able to finish an upgrade when `finishes`. */
const install = async ({
    version,
    finishes = true,
    name = PACKAGE,
}: {
    version: string
    finishes?: boolean
    name?: string
}) => {
    await Bun.write(
        join(package_dir, 'package.json'),
        JSON.stringify({ name, version })
    )
    await Bun.write(entry, '#!/usr/bin/env bun\n')
    if (finishes) {
        await Bun.write(
            join(package_dir, 'engine', 'cli', 'upgrade-finish.ts'),
            'export {}\n'
        )
    }
    await symlink(entry, join(bin_dir, 'luca'))
}

beforeEach(async () => {
    root = realpathSync(await mkdtemp(join(tmpdir(), 'luca-hand-off-')))
    bin_dir = join(root, 'bin')
    package_dir = join(root, 'install', 'node_modules', '@alecsibilia', 'luca')
    entry = join(package_dir, 'engine', 'cli', 'luca.ts')
    await mkdir(bin_dir, { recursive: true })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('luca upgrade finds the new install (#529)', () => {
    test("Bun's global luca, when it is the version just installed and can finish, is the entry", async () => {
        await install({ version: '14.0.0-alpha.11' })

        expect(
            await findNewInstall({ bin_dir, version: '14.0.0-alpha.11' })
        ).toEqual({ ok: true, entry })
    })

    test("a version from before the hand-off can't finish, so the running Luca does", async () => {
        await install({ version: '14.0.0-alpha.9', finishes: false })

        expect(
            await findNewInstall({ bin_dir, version: '14.0.0-alpha.9' })
        ).toEqual({
            ok: false,
            why: "Luca 14.0.0-alpha.9 can't finish an upgrade itself",
        })
    })

    test("a global luca of another version isn't the new install", async () => {
        await install({ version: '14.0.0-alpha.10' })

        expect(
            await findNewInstall({ bin_dir, version: '14.0.0-alpha.11' })
        ).toEqual({
            ok: false,
            why: `The luca in ${bin_dir} is ${PACKAGE}@14.0.0-alpha.10, not ${PACKAGE}@14.0.0-alpha.11`,
        })
    })

    test("a global luca from another package (such as a linked working copy) isn't the new install", async () => {
        await install({ version: '14.0.0-alpha.11', name: '@luca/engine' })

        const found = await findNewInstall({
            bin_dir,
            version: '14.0.0-alpha.11',
        })

        expect(found.ok).toBe(false)
    })

    test('no global luca at all is said plainly', async () => {
        expect(
            await findNewInstall({ bin_dir, version: '14.0.0-alpha.11' })
        ).toEqual({
            ok: false,
            why: `Bun's global commands folder ${bin_dir} has no luca`,
        })
    })
})

describe('luca upgrade hands off to the new install (#529)', () => {
    test('runs the entry with upgrade --finish and the board fingerprint, and passes its exit code through', async () => {
        const argv_file = join(root, 'argv.json')
        await Bun.write(
            entry,
            `await Bun.write(${JSON.stringify(argv_file)}, JSON.stringify(Bun.argv.slice(2)))\nprocess.exit(3)\n`
        )

        const end = await handOff({
            bun_path: process.execPath,
            entry,
            board_before: 'abc123',
            cwd: root,
        })

        expect(end).toEqual({ handed_off: true, exit_code: 3 })
        expect(await Bun.file(argv_file).json()).toEqual([
            'upgrade',
            '--finish',
            '--board-before',
            'abc123',
        ])
    })

    test('an unknown board fingerprint is left off', async () => {
        const argv_file = join(root, 'argv.json')
        await Bun.write(
            entry,
            `await Bun.write(${JSON.stringify(argv_file)}, JSON.stringify(Bun.argv.slice(2)))\n`
        )

        const end = await handOff({
            bun_path: process.execPath,
            entry,
            board_before: null,
            cwd: root,
        })

        expect(end).toEqual({ handed_off: true, exit_code: 0 })
        expect(await Bun.file(argv_file).json()).toEqual([
            'upgrade',
            '--finish',
        ])
    })

    test("a Bun that can't be started throws, for upgrade to report", async () => {
        await Bun.write(entry, 'process.exit(0)\n')

        await expect(
            handOff({
                bun_path: join(root, 'no-such-bun'),
                entry,
                board_before: null,
                cwd: root,
            })
        ).rejects.toThrow()
    })
})

describe("luca upgrade's flags", () => {
    test('no flags stay on the channel; --to picks a version', () => {
        expect(parseUpgradeArgs({ argv: [] })).toEqual({
            finish: false,
            to: null,
        })
        expect(parseUpgradeArgs({ argv: ['--to', '14.0.0-alpha.3'] })).toEqual({
            finish: false,
            to: '14.0.0-alpha.3',
        })
    })

    test('--finish, with or without the board fingerprint', () => {
        expect(parseUpgradeArgs({ argv: ['--finish'] })).toEqual({
            finish: true,
            board_before: null,
        })
        expect(
            parseUpgradeArgs({ argv: ['--finish', '--board-before', 'abc'] })
        ).toEqual({ finish: true, board_before: 'abc' })
    })

    test('bad flags are refused', () => {
        for (const argv of [
            ['--to'],
            ['--to', '--finish'],
            ['--to', '1.0.0', 'extra'],
            ['--finish', 'extra'],
            ['--finish', '--board-before'],
            ['--finish', '--board-before', 'abc', 'extra'],
            ['--finish', '--to', '1.0.0'],
            ['--nope'],
        ]) {
            expect(parseUpgradeArgs({ argv })).toBeUndefined()
        }
    })
})
