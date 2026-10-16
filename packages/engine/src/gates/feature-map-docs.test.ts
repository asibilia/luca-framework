import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { featureMapFiles } from './feature-map'

const ROOT = join(import.meta.dir, '../../../..')
const PATTERNS = ['packages/**/*.test.ts']

describe("this repo's feature map (#583)", async () => {
    const text = await Bun.file(join(ROOT, 'docs/feature-map.md')).text()
    const listed = featureMapFiles({ text, test_file_patterns: PATTERNS })
    const testFiles = [
        ...new Bun.Glob('packages/**/*.test.ts').scanSync({ cwd: ROOT }),
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

    test('the config names it', async () => {
        const config = await Bun.file(join(ROOT, '.luca/config.json')).json()
        expect(config.feature_map).toBe('docs/feature-map.md')
    })
})
