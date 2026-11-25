/**
 * `luca check`: runs the checks in the current repo's `.luca/config.json`
 * (#788), the same way this repo's gate (`gate.yml`) and Luca's gates do:
 *
 *   luca check [--only <names>] [--skip-slow]
 *
 * `--only` takes a comma list of `test`, `slow_test`, `types` and `lint`
 * (`--only lint,types` for a quick pre-commit). `--skip-slow` leaves out
 * `slow_test`. The repo is the git top folder of the current folder, or
 * the folder itself outside git. A repo's git hooks call it (see
 * `docs/setup.md`, "Wiring it into a repo's git hooks"), skipping it when
 * `LUCA_SKIP_HOOKS` is `1`, as Luca sets it in its runs (`SKIP_HOOKS_ENV`).
 *
 * Exits 0 when every check passed, 1 when one failed or the config
 * couldn't be read, 2 on bad flags.
 */
import { z } from 'zod'

import {
    CheckNameSchema,
    runRepoChecks,
    runShellCheck,
    type CheckPick,
} from '../config/repo-checks'
import { runCommand } from '../shell/run-command'

/** `luca check`'s usage line. */
export const CHECK_USAGE = `Usage: luca check [--only <${CheckNameSchema.options.join(',')}>] [--skip-slow]`

const OnlySchema = z
    .string()
    .transform((list) =>
        list
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name !== '')
    )
    .pipe(z.array(CheckNameSchema).min(1))

/**
 * The checks `luca check`'s flags pick, or `null` for bad flags: an unknown
 * flag, `--only` without names, or a name that isn't a check. Pure.
 *
 * @example
 * parseCheckArgs({ argv: ['--only', 'lint,types'] }) // { only: ['lint', 'types'], skip_slow: false }
 * parseCheckArgs({ argv: ['--only=lint', '--skip-slow'] }) // { only: ['lint'], skip_slow: true }
 * parseCheckArgs({ argv: ['--fast'] }) // null
 */
export const parseCheckArgs = ({
    argv,
}: {
    argv: string[]
}): CheckPick | null => {
    let only: CheckPick['only'] = null
    let skip_slow = false
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i] ?? ''
        if (flag === '--skip-slow') {
            skip_slow = true
            continue
        }
        const inline = /^--only=(.*)$/.exec(flag)
        const list =
            inline !== null
                ? inline[1]
                : flag === '--only'
                  ? argv[++i]
                  : undefined
        if (list === undefined || only !== null) return null
        const parsed = OnlySchema.safeParse(list)
        if (!parsed.success) return null
        only = parsed.data
    }
    return { only, skip_slow }
}

/** The git top folder of `cwd`, or `cwd` outside git. */
const repoRootOf = async ({ cwd }: { cwd: string }): Promise<string> => {
    const top = await runCommand({
        cmd: ['git', 'rev-parse', '--show-toplevel'],
        cwd,
    })
    const said = top.stdout.trim()
    return top.exit_code === 0 && said !== '' ? said : cwd
}

/** Runs `luca check` with the flags after `check`; returns the exit code. */
export const checkCommand = async ({
    argv,
}: {
    argv: string[]
}): Promise<number> => {
    const pick = parseCheckArgs({ argv })
    if (pick === null) {
        console.error(CHECK_USAGE)
        return 2
    }
    return runRepoChecks({
        repo_root: await repoRootOf({ cwd: process.cwd() }),
        pick,
        run: runShellCheck,
    })
}
