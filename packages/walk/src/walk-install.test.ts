import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

/**
 * Building and installing Luca Walk (#754): the manifest's scripts and
 * entry point, the ignore rules for what the build leaves behind, and the
 * README's install line.
 */

const PACKAGE = join(import.meta.dir, '..')
const ROOT = join(PACKAGE, '../..')

const ManifestSchema = z.object({
    main: z.string(),
    scripts: z.record(z.string(), z.string()),
})

/** The paths `git check-ignore` reports as ignored, from the repo's root. */
const checkIgnore = (paths: string[]): Promise<string[]> =>
    new Promise((resolve) => {
        execFile(
            'git',
            ['check-ignore', '--no-index', ...paths],
            { cwd: ROOT },
            (_error, stdout) =>
                resolve(
                    String(stdout)
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line !== '')
                )
        )
    })

describe('building and installing Luca Walk (#754)', () => {
    test('package.json has the build and package scripts, and main is ./dist/extension.js', async () => {
        const manifest = ManifestSchema.parse(
            JSON.parse(await readFile(join(PACKAGE, 'package.json'), 'utf8'))
        )

        expect(Object.keys(manifest.scripts)).toEqual(
            expect.arrayContaining(['build', 'package'])
        )
        expect(manifest.main).toBe('./dist/extension.js')
    })

    test('git ignores the bundle and the .vsix', async () => {
        const paths = [
            'packages/walk/dist/extension.js',
            'packages/walk/luca-walk.vsix',
        ]

        expect((await checkIgnore(paths)).toSorted()).toEqual(paths.toSorted())
    })

    test('the README holds the install line', async () => {
        const readme = await readFile(join(PACKAGE, 'README.md'), 'utf8')
        const lines = readme.split('\n').map((line) => line.trim())

        expect(lines).toContain(
            'code --profile "Luca Walk" --install-extension packages/walk/luca-walk.vsix'
        )
    })
})
