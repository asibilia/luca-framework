import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { readFeatureMap } from './feature-map'

const ROOT = join(import.meta.dir, '../../../..')

/** The folder this repo keeps its feature map in (#597). */
const MAP_FOLDER = 'docs/feature-map'

/** The file size limit, in bytes (`scripts/check-file-size.ts`: 5,000 tokens). */
const SIZE_LIMIT_BYTES = 20_000

/** The part of `.luca/config.json` this test reads. */
const ConfigSchema = z.object({
    feature_map: z.string(),
    test_file_patterns: z.array(z.string()).min(1),
})

/** Every `*.md` page under a folder, repo-relative, in sorted order. */
const pagesIn = (folder: string): string[] =>
    [...new Bun.Glob('**/*.md').scanSync({ cwd: join(ROOT, folder) })]
        .map((page) => join(folder, page))
        .toSorted()

describe("this repo's feature map (#583)", async () => {
    // The patterns come from the config, so this test and the red check
    // cannot drift apart.
    const config = ConfigSchema.parse(
        await Bun.file(join(ROOT, '.luca/config.json')).json()
    )
    const patterns = config.test_file_patterns
    // Read the map the way the red check does: the file the config names, or
    // every page under the folder it names (#597). `null` when it can't be read.
    const map = await readFeatureMap({
        cwd: ROOT,
        path: config.feature_map,
        test_file_patterns: patterns,
    })
    const listed = map ?? []
    const testFiles = [
        ...new Set(
            patterns.flatMap((pattern) => [
                ...new Bun.Glob(pattern).scanSync({ cwd: ROOT }),
            ])
        ),
    ]
        .filter((file) => !file.includes('node_modules/'))
        .toSorted()

    test('every listed test file exists', () => {
        expect(listed.filter((file) => !existsSync(join(ROOT, file)))).toEqual(
            []
        )
    })

    test('every test file is listed under a feature', () => {
        expect(testFiles.filter((file) => !listed.includes(file))).toEqual([])
    })

    test('the config names it', () => {
        expect(existsSync(join(ROOT, config.feature_map))).toBe(true)
        expect(map).not.toBeNull()
    })

    test('the config names the docs/feature-map folder, and the old single file is gone (#597)', () => {
        expect(config.feature_map).toBe(MAP_FOLDER)
        expect(statSync(join(ROOT, MAP_FOLDER)).isDirectory()).toBe(true)
        expect(existsSync(join(ROOT, 'docs/feature-map.md'))).toBe(false)
    })

    test('the folder is an index.md and one page per group of features, each under the size limit (#597)', () => {
        const folderPages = pagesIn(MAP_FOLDER)
        expect(folderPages).toContain(`${MAP_FOLDER}/index.md`)
        expect(folderPages.length).toBeGreaterThan(2)
        expect(
            folderPages.filter(
                (page) => statSync(join(ROOT, page)).size > SIZE_LIMIT_BYTES
            )
        ).toEqual([])
    })
})
