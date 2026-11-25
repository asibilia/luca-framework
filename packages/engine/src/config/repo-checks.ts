/**
 * A repo's checks, as `.luca/config.json` lists them, run one after another
 * (#788). `luca check` and `scripts/run-checks.ts` (the repo's gate, `gate.yml`) both run
 * them through `runRepoChecks`, so a repo's git hooks, its CI and Luca's
 * own gates can't drift apart.
 */
import { z } from 'zod'

import { loadEngineConfig, type EngineConfig } from './engine-config'
import { fastBunCommand, slowTestCommands, testCommands } from './test-commands'

import { cleanGitEnv } from '../git/git-local-env'

/** The checks a config can list, in the order they run. */
export const CheckNameSchema = z.enum(['test', 'slow_test', 'types', 'lint'])

export type CheckName = z.infer<typeof CheckNameSchema>

/** Which checks to run: `only` these (`null`: all), and whether to skip slow tests. */
export const CheckPickSchema = z.object({
    only: z.array(CheckNameSchema).nullable().default(null),
    skip_slow: z.boolean().default(false),
})

export type CheckPick = z.infer<typeof CheckPickSchema>

/** One check to run: its config name and the shell command. */
export type RepoCheck = { name: CheckName; command: string }

/**
 * The checks in `config`, in order: its test commands (a fast `bun` one
 * with the config's `test_case_timeout_ms` as `--timeout`, #580, as in the
 * gates), its slow test commands, `types`, then `lint`. `only` keeps the
 * named ones; `skip_slow` leaves out `slow_test`. Pure.
 *
 * @example
 * repoChecks({ config, pick: { only: ['lint'], skip_slow: false } })
 * // [{ name: 'lint', command: 'bun run lint' }]
 */
export const repoChecks = ({
    config,
    pick,
}: {
    config: EngineConfig
    pick: CheckPick
}): RepoCheck[] => {
    const { types, lint } = config.checks
    const all: RepoCheck[] = [
        ...testCommands({ config }).map(({ run, results }) => ({
            name: CheckNameSchema.enum.test,
            command: results === 'bun' ? fastBunCommand({ run, config }) : run,
        })),
        ...slowTestCommands({ config }).map(({ run }) => ({
            name: CheckNameSchema.enum.slow_test,
            command: run,
        })),
        ...(types === undefined
            ? []
            : [{ name: CheckNameSchema.enum.types, command: types }]),
        ...(lint === undefined
            ? []
            : [{ name: CheckNameSchema.enum.lint, command: lint }]),
    ]
    return all.filter(
        ({ name }) =>
            (pick.only === null || pick.only.includes(name)) &&
            !(pick.skip_slow && name === 'slow_test')
    )
}

/**
 * Runs one check in a shell (a check may chain commands with `&&`), its
 * output straight to this process's, with exactly `env`; `true` when it
 * exited 0.
 */
export const runShellCheck = async ({
    command,
    cwd,
    env,
}: {
    command: string
    cwd: string
    env: Record<string, string>
}): Promise<boolean> => {
    const child = Bun.spawn(['sh', '-c', command], {
        cwd,
        env,
        stdout: 'inherit',
        stderr: 'inherit',
    })
    return (await child.exited) === 0
}

/**
 * Runs the checks in `<repo_root>/.luca/config.json` that `pick` keeps, in
 * the repo root, printing each command before it runs and a short summary
 * at the end. Every check runs, even after one fails. Returns the exit
 * code: 0 when all passed, 1 when one failed, the config couldn't be read,
 * or nothing was left to run. `run` runs one check: `runShellCheck`, or a
 * fake in tests. Every check gets this process's environment without git's
 * repo-local variables (`cleanGitEnv`, #791): run from a git hook, a test
 * that makes a scratch repo would otherwise write to the real one.
 *
 * @example
 * process.exit(await runRepoChecks({ repo_root: '/Users/me/repo', pick: { only: null, skip_slow: false }, run: runShellCheck }))
 */
export const runRepoChecks = async ({
    repo_root,
    pick,
    run,
}: {
    repo_root: string
    pick: CheckPick
    run: (args: {
        command: string
        cwd: string
        env: Record<string, string>
    }) => Promise<boolean>
}): Promise<number> => {
    const { log, error } = console
    const loaded = await loadEngineConfig({ repo_root })
    if (!loaded.ok) {
        error(loaded.error)
        return 1
    }
    const checks = repoChecks({ config: loaded.config, pick })
    if (checks.length === 0) {
        error(
            pick.only === null
                ? '.luca/config.json lists no checks'
                : `.luca/config.json lists none of: ${pick.only.join(', ')}`
        )
        return 1
    }
    const env = cleanGitEnv()
    const failed: RepoCheck[] = []
    for (const check of checks) {
        log(`\n$ ${check.command}`)
        if (!(await run({ command: check.command, cwd: repo_root, env }))) {
            failed.push(check)
        }
    }
    if (failed.length > 0) {
        error(`\n${failed.length} of ${checks.length} check(s) failed:`)
        for (const { name, command } of failed) {
            error(`  ${name}: ${command}`)
        }
        return 1
    }
    log(`\nAll ${checks.length} checks passed.`)
    return 0
}
