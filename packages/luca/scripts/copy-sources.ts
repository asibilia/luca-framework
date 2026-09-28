#!/usr/bin/env bun
/**
 * Fills the publish package at pack time (`prepack`), and empties it again
 * after (`postpack`, with `--clean`):
 *
 *   engine/   the engine's TypeScript source, as is (the bins run it)
 *   board/    the board plugin's folder, as Paseo installs it from a folder
 *             source: its manifest, entry points, client, server, and shared
 *             code, and its own package.json; its version module stamped
 *             with this package's version
 *   LICENSE   the repo's license
 *
 * Test files, and the board's test helpers, stay out. There is no build: the
 * engine only runs on Bun.
 */
import { cp, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { z } from 'zod'

const PACKAGE_DIR = join(import.meta.dir, '..')
const PACKAGES_DIR = join(PACKAGE_DIR, '..')
const REPO_DIR = join(PACKAGES_DIR, '..')
const ENGINE_SRC = join(PACKAGES_DIR, 'engine', 'src')
const BOARD_DIR = join(PACKAGES_DIR, 'board')

/** What the pack adds to the package folder, removed again by `--clean`. */
const COPIES = ['engine', 'board', 'LICENSE']

/** The board's files and folders Paseo loads, besides its package.json. */
const BOARD_ENTRIES = [
    'paseo-plugin.json',
    'index.server.ts',
    'index.client.tsx',
    'client',
    'server',
    'shared',
]

/**
 * `bun pm pack` leaves out every `bunfig.toml` by default, even one named in
 * `files`. The engine needs its own (the board starts it with
 * `--config=<engine_dir>/bunfig.toml`), so an `.npmignore` in the engine's
 * copy puts it back. Pack leaves the `.npmignore` itself out.
 */
const ENGINE_NPMIGNORE = '!bunfig.toml\n'

const isTestFile = (path: string) => /\.test\.[cm]?[jt]sx?$/.test(path)

/** Leaves out tests and test helpers (`testing/` folders under the board). */
const keepBoardFile = (source: string) =>
    !isTestFile(source) &&
    !relative(BOARD_DIR, source).split(sep).includes('testing')

const clean = async () => {
    for (const copy of COPIES) {
        await rm(join(PACKAGE_DIR, copy), { recursive: true, force: true })
    }
}

const BoardManifestSchema = z.looseObject({
    name: z.string(),
    type: z.string(),
})

const LucaManifestSchema = z.looseObject({ version: z.string() })

/** The board's version module, which holds the dev value in the repo. */
const BOARD_VERSION_MODULE = join('server', 'luca-version.ts')

/** This package's version. */
const lucaVersion = async (): Promise<string> =>
    LucaManifestSchema.parse(
        await Bun.file(join(PACKAGE_DIR, 'package.json')).json()
    ).version

/**
 * The board's package.json for its folder in the tarball: its name and
 * module type, at this package's version, with no dependencies of its own
 * (this package carries them).
 */
const boardManifest = async ({
    version,
}: {
    version: string
}): Promise<string> => {
    const board = BoardManifestSchema.parse(
        await Bun.file(join(BOARD_DIR, 'package.json')).json()
    )
    const manifest = {
        name: board.name,
        version,
        private: true,
        type: board.type,
    }
    return `${JSON.stringify(manifest, null, 4)}\n`
}

/**
 * The board's version module for its folder in the tarball, holding this
 * package's version. Paseo bundles the board's server, so the version has
 * to be in its code, not in a file beside it (#477).
 */
const boardVersionModule = ({ version }: { version: string }): string =>
    [
        '/** The Luca version of this board, stamped when the package was packed. */',
        `export const LUCA_VERSION: string = ${JSON.stringify(version)}`,
        '',
    ].join('\n')

const fill = async () => {
    await clean()
    await cp(ENGINE_SRC, join(PACKAGE_DIR, 'engine'), {
        recursive: true,
        filter: (source) => !isTestFile(source),
    })
    await Bun.write(join(PACKAGE_DIR, 'engine', '.npmignore'), ENGINE_NPMIGNORE)
    for (const entry of BOARD_ENTRIES) {
        await cp(join(BOARD_DIR, entry), join(PACKAGE_DIR, 'board', entry), {
            recursive: true,
            filter: keepBoardFile,
        })
    }
    const version = await lucaVersion()
    await Bun.write(
        join(PACKAGE_DIR, 'board', 'package.json'),
        await boardManifest({ version })
    )
    await Bun.write(
        join(PACKAGE_DIR, 'board', BOARD_VERSION_MODULE),
        boardVersionModule({ version })
    )
    await cp(join(REPO_DIR, 'LICENSE'), join(PACKAGE_DIR, 'LICENSE'))
}

await (Bun.argv.includes('--clean') ? clean() : fill())
