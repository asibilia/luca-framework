import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
} from 'node:fs'
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
const EXPECTED_CASES = [
    '1-wrong-finding',
    '2-missing-tool',
    '3-machine-blamed',
    '4-planted-bug',
    '5-clean-change',
]

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
                '-z',
                '--',
                case_dir,
            ])
            if (git_result.exitCode !== 0) {
                throw new Error(
                    `git ls-files failed: ${git_result.stderr.toString()}`
                )
            }
            const tracked_text = git_result.stdout.toString()
            const tracked_files =
                tracked_text === ''
                    ? []
                    : tracked_text
                          .split('\0')
                          .filter((path) => path !== '')
                          .map((path) =>
                              relative(case_dir, join(REPO_ROOT, path))
                          )
                          .sort()
            expect(local_files).toEqual(tracked_files)
        })
    }

    test('4 and 5 are the same pull request, and only 4 has the planted bug and claim', async () => {
        const four = join(CASES_DIR, '4-planted-bug')
        const five = join(CASES_DIR, '5-clean-change')
        expect(readFileSync(join(four, 'workspace', 'pr.md'), 'utf8')).toBe(
            readFileSync(join(five, 'workspace', 'pr.md'), 'utf8')
        )
        const built_four = await buildWorkspace({
            the_case: await loadCase({ dir: four }),
            case_dir: four,
            root: join(tmp, 'pair-4'),
            skill_dir: null,
        })
        const built_five = await buildWorkspace({
            the_case: await loadCase({ dir: five }),
            case_dir: five,
            root: join(tmp, 'pair-5'),
            skill_dir: null,
        })
        const differ = filesUnder({
            dir: built_four.ws,
            skip: ['notes'],
        }).filter(
            (path) =>
                readFileSync(join(built_four.ws, path), 'utf8') !==
                readFileSync(join(built_five.ws, path), 'utf8')
        )
        expect(differ).toEqual([
            'change.diff',
            'files/packages/engine/skills/luca-retro/scripts/retro-summary.ts',
            'files/packages/engine/skills/luca-unstick/scripts/stuck-summary.ts',
            'pr.md',
        ])

        const twins = [
            'files/packages/engine/skills/luca-unstick/scripts/stuck-summary.ts',
            'files/packages/engine/skills/luca-retro/scripts/retro-summary.ts',
        ]
        for (const twin of twins) {
            expect(readFileSync(join(built_four.ws, twin), 'utf8')).toContain(
                "want.has(resolve(text(started.content.repo) || '/'))"
            )
            expect(readFileSync(join(built_five.ws, twin), 'utf8')).toContain(
                "want.has(realPath(text(started.content.repo) || '/'))"
            )
        }
        expect(readFileSync(join(built_four.ws, 'pr.md'), 'utf8')).toContain(
            "- From a bare repo or a submodule, it now finds the parent repo's runs too."
        )
        expect(readFileSync(join(built_five.ws, 'pr.md'), 'utf8')).toContain(
            '- A bare repo or a submodule has no'
        )

        // The retro twin's repoRuns line is the same before and after the
        // planted change, so git would show no hunk for it at all: not a
        // "-" line and a "+" line that read the same, and not a hunk of
        // context only (which `git apply` refuses).
        const planted_diff = readFileSync(
            join(built_four.ws, 'change.diff'),
            'utf8'
        )
        const planted_line =
            "want.has(resolve(text(started.content.repo) || '/'))"
        expect(planted_diff).not.toContain(
            `-${' '.repeat(16)}${planted_line}\n+`
        )
        expect(planted_diff).not.toContain('@@ -1197,7 +1197,7 @@')
        // Only the unstick twin's "+" line is left.
        expect(planted_diff.split(planted_line)).toHaveLength(2)
    })

    for (const name of ['4-planted-bug', '5-clean-change']) {
        test(`${name}: its change.diff applies to the PR's parent and gives its files/`, async () => {
            const case_dir = join(CASES_DIR, name)
            const the_case = await loadCase({ dir: case_dir })
            const git_diff = the_case.git_diff
            if (git_diff === null) throw new Error(`${name} has no git_diff`)
            const { ws } = await buildWorkspace({
                the_case,
                case_dir,
                root: join(tmp, `apply-${name}`),
                skill_dir: null,
            })
            const before = join(tmp, `before-${name}`)
            mkdirSync(before, { recursive: true })
            for (const path of git_diff.paths) {
                const shown = Bun.spawnSync([
                    'git',
                    '-C',
                    REPO_ROOT,
                    'show',
                    `${git_diff.commit}^:${path}`,
                ])
                // A file the pull request adds isn't in the parent.
                if (shown.exitCode !== 0) continue
                await Bun.write(join(before, path), shown.stdout)
            }
            const applied = Bun.spawnSync(
                ['git', 'apply', join(ws, git_diff.into)],
                { cwd: before }
            )
            expect(applied.stderr.toString()).toBe('')
            expect(applied.exitCode).toBe(0)
            for (const file of the_case.git_files) {
                expect(readFileSync(join(before, file.path), 'utf8')).toBe(
                    readFileSync(join(ws, file.into), 'utf8')
                )
            }
        })
    }
})
