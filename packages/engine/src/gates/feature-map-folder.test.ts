import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { readFeatureMap } from './feature-map'
import type { TestRun } from './gate-schemas'
import { checkRed } from './red-check'

/**
 * The feature map as a folder (#597): with `feature_map` naming a folder,
 * every `*.md` page under it, read in sorted order, together is the map. A
 * single-file map is read as before. Real files in a temp worktree.
 */

const PATTERNS = ['src/**/*.test.ts']

const FOLDER = 'docs/feature-map'

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-feature-map-folder-'))
})

afterEach(async () => {
    await chmod(join(root, FOLDER), 0o755).catch(() => undefined)
    await rm(root, { recursive: true, force: true })
})

/** Writes each page, by its worktree-relative path. */
const writePages = async (pages: Record<string, string>) => {
    for (const [path, text] of Object.entries(pages)) {
        await mkdir(dirname(join(root, path)), { recursive: true })
        await writeFile(join(root, path), text)
    }
}

const read = (path: string) =>
    readFeatureMap({ cwd: root, path, test_file_patterns: PATTERNS })

const run = (files_without_results: string[]): TestRun => ({
    command: 'bun test',
    ok: false,
    exit_code: 1,
    no_test_files: false,
    cases: [],
    files_without_results,
    output: '',
})

/**
 * The new test file's text. It names its test `a` without a test call, so
 * this file's own text holds no test besides its real ones.
 */
const NEW_TEST = "describe('new', () => { /* adds a */ })"

/** The red check on a ticket that created `src/new.test.ts`. */
const redWith = (feature_map: { path: string; files: string[] | null }) =>
    checkRed({
        criteria_ids: ['AC1'],
        mapping: [
            {
                criterion_id: 'AC1',
                tests: [{ file: 'src/new.test.ts', name: 'new > a' }],
            },
        ],
        baseline: run([]),
        current: run(['src/new.test.ts']),
        test_files: ['src/new.test.ts'],
        sources: { 'src/new.test.ts': NEW_TEST },
        changed_test_sources: [
            { file: 'src/new.test.ts', base: null, current: NEW_TEST },
        ],
        feature_map,
    })

describe('a feature map folder (#597)', () => {
    test('a new test file listed on any page passes the red check, and one listed on no page is refused, naming the folder', async () => {
        await writePages({
            [`${FOLDER}/index.md`]: '# Feature map\n\nOne page per area.\n',
            [`${FOLDER}/building.md`]: '## Building\n\n- `src/old.test.ts`\n',
            [`${FOLDER}/guards.md`]: '## Guards\n\n- `src/new.test.ts`\n',
        })
        const listed = await read(FOLDER)
        expect(listed).toEqual(['src/old.test.ts', 'src/new.test.ts'])
        expect(redWith({ path: FOLDER, files: listed }).ok).toBe(true)

        await writePages({
            [`${FOLDER}/guards.md`]: '## Guards\n\nNone yet.\n',
        })
        const unlisted = redWith({ path: FOLDER, files: await read(FOLDER) })
        expect(unlisted.ok).toBe(false)
        expect(
            unlisted.problems.filter(
                (problem) =>
                    problem.startsWith(
                        "src/new.test.ts: a new test file the feature map doesn't list"
                    ) && problem.includes(FOLDER)
            )
        ).toHaveLength(1)
    })

    test('every *.md page under the folder is read in sorted order, nested pages too, with ./ entries counted and each test file once', async () => {
        await writePages({
            [`${FOLDER}/zeta.md`]:
                '- `./src/a.test.ts`\n- `src/z.test.ts`\n- `src/z.ts`\n',
            [`${FOLDER}/alpha.md`]: '- `src/a.test.ts`\n',
            [`${FOLDER}/middle/nested.md`]: '- `./src/m.test.ts`\n',
            [`${FOLDER}/notes.txt`]: '- `src/txt.test.ts`\n',
        })

        expect(await read(FOLDER)).toEqual([
            'src/a.test.ts',
            'src/m.test.ts',
            'src/z.test.ts',
        ])
        // A `./` spelling of the folder is the same folder.
        expect(await read(`./${FOLDER}`)).toEqual([
            'src/a.test.ts',
            'src/m.test.ts',
            'src/z.test.ts',
        ])
    })

    test('a missing folder reads as null, and the red check names it as missing, not a crash', async () => {
        expect(await read(FOLDER)).toBeNull()
        expect(redWith({ path: FOLDER, files: null }).problems).toContain(
            `The feature map ${FOLDER} is missing: restore it, or add it with the new test file listed`
        )
    })

    test('a folder that cannot be read reads as null, not a crash', async () => {
        await writePages({ [`${FOLDER}/guards.md`]: '- `src/new.test.ts`\n' })
        await chmod(join(root, FOLDER), 0o000)

        expect(await read(FOLDER)).toBeNull()
    })

    test('a single-file map is read as before: its own test files only, and null when missing', async () => {
        await writePages({
            'docs/feature-map.md': '- `src/a.test.ts`\n- `./src/b.test.ts`\n',
            'docs/other.md': '- `src/other.test.ts`\n',
        })

        expect(await read('docs/feature-map.md')).toEqual([
            'src/a.test.ts',
            'src/b.test.ts',
        ])
        expect(await read('docs/missing.md')).toBeNull()
    })
})
