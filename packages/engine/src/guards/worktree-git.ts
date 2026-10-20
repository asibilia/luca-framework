import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import uniq from 'lodash/uniq'

import { runCommand, type CommandResult } from '../shell/run-command'

/**
 * Put before every git command the check runs, so an fsmonitor or hook
 * someone planted in the shared `.git` never runs for the engine. Content
 * filters are switched off too, by `noFilters`.
 */
const SAFE_GIT = [
    '-c',
    'core.fsmonitor=false',
    '-c',
    'core.hooksPath=/dev/null',
]

export const nulSplit = (text: string): string[] =>
    text.split('\0').filter((part) => part.length > 0)

/** The environment variables `noFilters` points git's settings at. */
const NO_FILTER_ENV = { LUCA_GIT_EMPTY: '', LUCA_GIT_FALSE: 'false' }

/**
 * Every content filter (`filter.<name>.*`) git's config names, read fresh
 * for each command, since another process may add one at any time.
 */
const filterNames = async ({ cwd }: { cwd: string }): Promise<string[]> => {
    const listed = await runCommand({
        cmd: ['git', ...SAFE_GIT, 'config', '-z', '--get-regexp', '^filter\\.'],
        cwd,
        timeout_ms: 60_000,
    })
    return uniq(
        nulSplit(listed.stdout).flatMap((entry) => {
            const key = entry.split('\n')[0] ?? ''
            const last = key.lastIndexOf('.')
            // `>=` keeps the empty name (`filter..clean`): git runs a filter named "".
            return last >= 'filter.'.length
                ? [key.slice('filter.'.length, last)]
                : []
        })
    )
}

/**
 * Options that switch each named filter off: no clean, smudge, or process
 * command, and not required (git gives up on a required filter with no
 * command). Set through `--config-env`, which takes any filter name, even
 * one with `=` in it.
 */
const noFilters = (names: string[]): string[] =>
    names.flatMap((name) => [
        `--config-env=filter.${name}.clean=LUCA_GIT_EMPTY`,
        `--config-env=filter.${name}.smudge=LUCA_GIT_EMPTY`,
        `--config-env=filter.${name}.process=LUCA_GIT_EMPTY`,
        `--config-env=filter.${name}.required=LUCA_GIT_FALSE`,
    ])

/** A git run, and why git could not start (such as `cwd` being gone). */
type GitRun = CommandResult & { start_error: string | null }

const runGit = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<GitRun> => {
    try {
        const names = await filterNames({ cwd })
        const result = await runCommand({
            cmd: ['git', ...SAFE_GIT, ...noFilters(names), ...args],
            cwd,
            timeout_ms: 60_000,
            env: NO_FILTER_ENV,
        })
        return { ...result, start_error: null }
    } catch (error) {
        return {
            exit_code: null,
            stdout: '',
            stderr: '',
            timed_out: false,
            start_error: error instanceof Error ? error.message : String(error),
        }
    }
}

export const git = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<{ ok: boolean; stdout: string }> => {
    const result = await runGit({ cwd, args })
    return { ok: result.exit_code === 0, stdout: result.stdout }
}

/** Why a git run failed, said even when git printed nothing. */
const gitFailure = ({ cwd, run }: { cwd: string; run: GitRun }): string =>
    [
        run.start_error !== null
            ? `could not start (${run.start_error})`
            : run.timed_out
              ? 'timed out'
              : run.exit_code === null
                ? 'killed'
                : `exit code ${run.exit_code}`,
        ...(existsSync(cwd) ? [] : ['the folder no longer exists']),
    ].join(', ')

export const gitOk = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<string> => {
    const result = await runGit({ cwd, args })
    if (result.exit_code !== 0) {
        const output = (result.stderr || result.stdout).trim()
        throw new Error(
            `git ${args.join(' ')} failed in ${cwd}: ${gitFailure({ cwd, run: result })}${output === '' ? '' : `\n${output}`}`
        )
    }
    return result.stdout
}

/** The global excludes file git would use. */
export const globalExcludesFile = async ({
    cwd,
}: {
    cwd: string
}): Promise<string> => {
    const set = await git({
        cwd,
        args: ['config', '--path', '--get', 'core.excludesFile'],
    })
    const xdg = process.env.XDG_CONFIG_HOME
    return set.ok
        ? set.stdout.trim()
        : join(
              xdg !== undefined && xdg !== ''
                  ? xdg
                  : join(homedir(), '.config'),
              'git/ignore'
          )
}

/**
 * The ignore rules git would use but for `.gitignore` files: the global
 * excludes file, then the shared `.git/info/exclude` (whose lines win).
 */
export const excludeRules = async ({
    global,
    common_dir,
}: {
    global: string
    common_dir: string
}): Promise<Uint8Array> => {
    const read = async (full: string) =>
        existsSync(full) && lstatSync(full).isFile()
            ? Bun.file(full).text()
            : ''
    const [globalRules, shared] = await Promise.all([
        read(global),
        read(join(common_dir, 'info/exclude')),
    ])
    return new TextEncoder().encode(`${globalRules}\n${shared}`)
}

/** Runs `use` with the rules written to a temp file, removed after. */
export const withExcludeFile = async <Result>({
    rules,
    use,
}: {
    rules: Uint8Array
    use: (file: string) => Promise<Result>
}): Promise<Result> => {
    const file = join(tmpdir(), `luca-engine-exclude-${randomUUID()}`)
    await Bun.write(file, rules)
    try {
        return await use(file)
    } finally {
        await rm(file, { force: true })
    }
}

/** The `ls-files` options that ignore by the snapshot's rules. */
export const excludeArgs = (file: string): string[] => [
    `--exclude-from=${file}`,
    '--exclude-per-directory=.gitignore',
]

export const commonDirOf = async ({ cwd }: { cwd: string }): Promise<string> =>
    (
        await gitOk({
            cwd,
            args: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        })
    ).trim()
