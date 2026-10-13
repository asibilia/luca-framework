import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import { loadCase } from './lib/case-schema'
import {
    CASES_DIR,
    REPO_ROOT,
    buildWorkspace,
    filesUnder,
} from './lib/workspace'

/**
 * Every eval case is well formed. Its case.json parses and names its own
 * folder. Its workspace builds (git files, diff, plants), and its plants
 * took. Its marker, if any, sits only in its notes.
 */

/** The cases written so far. */
const EXPECTED_CASES = ['1-wrong-finding', '2-missing-tool', '3-machine-blamed']

const tmp = mkdtempSync(join(tmpdir(), 'lr-cases-'))
afterAll(async () => {
    await rm(tmp, { recursive: true, force: true })
})

const textOf = ({ dir }: { dir: string }): string =>
    filesUnder({ dir })
        .map((path) => readFileSync(join(dir, path), 'utf8'))
        .join('\n')

describe('the eval cases', () => {
    test('they are the planned ones', () => {
        expect(
            readdirSync(CASES_DIR)
                .filter((name) => /^[1-9]-/.test(name))
                .sort()
        ).toEqual(EXPECTED_CASES)
    })

    for (const name of EXPECTED_CASES) {
        const case_dir = join(CASES_DIR, name)

        test(`${name}: its case.json parses and names its own folder`, async () => {
            expect((await loadCase({ dir: case_dir })).id).toBe(name)
        })

        test(`${name}: it builds, with its git files, diff and plants`, async () => {
            const the_case = await loadCase({ dir: case_dir })
            const { ws } = await buildWorkspace({
                the_case,
                case_dir,
                root: join(tmp, name),
                skill_dir: null,
            })
            for (const file of the_case.git_files) {
                expect(existsSync(join(ws, file.into))).toBe(true)
            }
            if (the_case.git_diff !== null) {
                const diffPath = join(ws, the_case.git_diff.into)
                const diffText = readFileSync(diffPath, 'utf8')
                expect(diffText).toContain('diff --git')
            }
            for (const plant of the_case.plants) {
                expect(textOf({ dir: ws })).not.toContain(plant.find)
            }
        })

        test(`${name}: its marker, if any, is only in notes/`, async () => {
            const the_case = await loadCase({ dir: case_dir })
            const notes = join(case_dir, 'notes')
            if (the_case.marker === null) {
                expect(existsSync(notes)).toBe(false)
                return
            }
            expect(textOf({ dir: notes })).toContain(the_case.marker)
            expect(textOf({ dir: join(case_dir, 'workspace') })).not.toContain(
                the_case.marker
            )
        })

        test(`${name}: every file in its folder is tracked by git`, () => {
            const local_files = filesUnder({ dir: case_dir }).sort()
            const git_result = Bun.spawnSync([
                'git',
                '-C',
                REPO_ROOT,
                'ls-files',
                '--',
                case_dir,
            ])
            if (git_result.exitCode !== 0) {
                throw new Error(
                    `git ls-files failed: ${git_result.stderr.toString()}`
                )
            }
            const tracked_text = git_result.stdout.toString().trim()
            const tracked_files =
                tracked_text === ''
                    ? []
                    : tracked_text
                          .split('\n')
                          .map((path) => relative(case_dir, path))
                          .sort()
            expect(local_files).toEqual(tracked_files)
        })
    }
})
