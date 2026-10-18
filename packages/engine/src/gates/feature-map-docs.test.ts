import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { featureMapFiles } from './feature-map'

const ROOT = join(import.meta.dir, '../../../..')

/** The part of `.luca/config.json` this test reads. */
const ConfigSchema = z.object({
    feature_map: z.string(),
    test_file_patterns: z.array(z.string()).min(1),
})

describe("this repo's feature map (#583)", async () => {
    // The patterns come from the config, so this test and the red check
    // cannot drift apart.
    const config = ConfigSchema.parse(
        await Bun.file(join(ROOT, '.luca/config.json')).json()
    )
    const patterns = config.test_file_patterns
    const text = await Bun.file(join(ROOT, 'docs/feature-map.md')).text()
    const listed = featureMapFiles({ text, test_file_patterns: patterns })
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
        expect(config.feature_map).toBe('docs/feature-map.md')
    })
})
