import { realpathSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { parseCheckArgs } from './check-command'

/**
 * `luca check` (#788): its flags, and the command run in a repo's
 * subfolder, where it reads that repo's `.luca/config.json`.
 */

const LUCA = join(import.meta.dir, 'luca.ts')

describe("luca check's flags", () => {
    test('no flags: every check', () => {
        expect(parseCheckArgs({ argv: [] })).toEqual({
            only: null,
            skip_slow: false,
        })
    })

    test('--only takes a comma list, spaced or as --only=', () => {
        expect(parseCheckArgs({ argv: ['--only', 'lint, types'] })).toEqual({
            only: ['lint', 'types'],
            skip_slow: false,
        })
        expect(
            parseCheckArgs({ argv: ['--only=test', '--skip-slow'] })
        ).toEqual({ only: ['test'], skip_slow: true })
    })

    test('an unknown flag or check, an empty --only, or two --only are refused', () => {
        for (const argv of [
            ['--fast'],
            ['--only', 'lint,format'],
            ['--only'],
            ['--only='],
            ['--only', 'lint', '--only', 'types'],
        ]) {
            expect(parseCheckArgs({ argv })).toBeNull()
        }
    })
})

describe('luca check in a repo', () => {
    let repo = ''
    beforeAll(async () => {
        repo = await mkdtemp(join(tmpdir(), 'luca-check-'))
        await Bun.write(
            join(repo, '.luca/config.json'),
            JSON.stringify({
                checks: {
                    test: 'echo test-ran',
                    types: 'echo types-ran && exit 3',
                    lint: 'pwd -P',
                },
                test_file_patterns: [],
                test_setup_files: [],
                rule_files: [],
            })
        )
        await Bun.write(join(repo, 'src/a.ts'), 'export {}\n')
        await $`git init -q`.cwd(repo).quiet()
    })
    afterAll(async () => {
        await rm(repo, { recursive: true, force: true })
    })

    const luca = (...argv: string[]) => {
        const out = Bun.spawnSync(['bun', LUCA, 'check', ...argv], {
            cwd: join(repo, 'src'),
        })
        return {
            code: out.exitCode,
            text: out.stdout.toString() + out.stderr.toString(),
        }
    }

    test('from a subfolder it runs the repo top folder config, and a failing check exits 1', () => {
        const { code, text } = luca()
        expect(code).toBe(1)
        expect(text).toContain('test-ran')
        expect(text).toContain('types-ran')
        expect(text).toContain('1 of 3 check(s) failed')
    })

    test('--only runs just those, in the repo top folder', () => {
        const { code, text } = luca('--only', 'lint')
        expect(code).toBe(0)
        expect(text).not.toContain('test-ran')
        expect(text).toContain(`${realpathSync(repo)}\n`)
        expect(text).toContain('All 1 checks passed.')
    })

    test('a bad flag prints the usage and exits 2', () => {
        const { code, text } = luca('--only', 'nope')
        expect(code).toBe(2)
        expect(text).toContain('Usage: luca check')
    })
})

describe('luca check from a git hook (#791)', () => {
    let root = ''
    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-check-git-env-'))
    })
    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test("a check that makes a scratch repo leaves the hook's repo, named by GIT_DIR, as it was", async () => {
        // The repo a pre-push hook runs in: git exports its GIT_DIR.
        const pushed = join(root, 'pushed')
        await Bun.write(join(pushed, 'a.txt'), 'a\n')
        await $`git init -q -b main`.cwd(pushed).quiet()
        await $`git add -A`.cwd(pushed).quiet()
        await $`git -c user.name=o -c user.email=o@o commit -q -m one`
            .cwd(pushed)
            .quiet()
        const state = async () => ({
            config: await Bun.file(join(pushed, '.git/config')).text(),
            refs: await $`git for-each-ref`.cwd(pushed).text(),
            head: await $`git rev-parse HEAD`.cwd(pushed).text(),
        })
        const before = await state()

        // The checked repo: a test that makes a scratch repo in a temp folder.
        const checked = join(root, 'checked')
        const scratch = join(root, 'scratch')
        await Bun.write(
            join(checked, '.luca/config.json'),
            JSON.stringify({
                checks: {
                    test: `mkdir -p ${scratch} && cd ${scratch} && git init -q && git config user.name t && git config user.email t@t && git config commit.gpgsign false && git commit -q --allow-empty -m junk && git tag v9.9.9 && git config core.bare true`,
                },
                test_file_patterns: [],
                test_setup_files: [],
                rule_files: [],
            })
        )
        await $`git init -q`.cwd(checked).quiet()

        const out = Bun.spawnSync(['bun', LUCA, 'check'], {
            cwd: checked,
            env: {
                ...process.env,
                GIT_DIR: join(pushed, '.git'),
                GIT_INDEX_FILE: join(pushed, '.git/index'),
            },
        })

        expect(out.stdout.toString()).toContain('All 1 checks passed.')
        expect(out.exitCode).toBe(0)
        expect(await state()).toEqual(before)
        // The junk went where the test meant it to.
        expect(await $`git tag`.cwd(scratch).text()).toBe('v9.9.9\n')
    })
})
