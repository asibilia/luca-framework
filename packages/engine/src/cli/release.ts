import { existsSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import uniq from 'lodash/uniq'

import { describeRun, goingRuns } from './going-runs'
import type { RunEnd } from './run-modes'

import { loadEngineConfig } from '../config/engine-config'
import { runGates } from '../gates/gate-runner'
import { FROZEN_INSTALL } from '../gates/lockfile-install'
import { runCommand } from '../shell/run-command'

/**
 * `luca-release`: makes a **release** (a date tag of this repo) and switches
 * every run to it. The pinned clone in `~/.local/share/luca/` is checked out
 * at the tag, and the `luca-board` plugin and its engine path point at it.
 */

/** The board plugin's id; its engine path is set to the pinned `luca-run`. */
export const BOARD_PLUGIN_ID = 'luca-board'

/** The side effects on Paseo, behind an adapter so tests can use a fake. */
export type ReleasePaseo = {
    /** `paseo plugin install <path> --id <id>`. */
    installPlugin: (args: { path: string; id: string }) => Promise<void>
    /** Writes the plugin's `engine_path` setting. */
    setEnginePath: (args: {
        plugin_id: string
        engine_path: string
    }) => Promise<void>
}

/** Where the pinned clone lives: `~/.local/share/luca`. */
export const defaultPinnedDir = ({ home_dir }: { home_dir: string }): string =>
    join(home_dir, '.local', 'share', 'luca')

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * The next release tag for `date` (local time): `luca-YYYY.MM.DD`, or
 * `luca-YYYY.MM.DD.2`, `.3`, and so on when that day already has one. Pure.
 *
 * @example
 * nextReleaseTag({ date: new Date(2026, 8, 25), existing: ['luca-2026.09.25'] })
 * // 'luca-2026.09.25.2'
 */
export const nextReleaseTag = ({
    date,
    existing,
}: {
    date: Date
    existing: string[]
}): string => {
    const day = `luca-${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`
    const taken = new Set(existing)
    if (!taken.has(day)) return day
    let n = 2
    while (taken.has(`${day}.${n}`)) n += 1
    return `${day}.${n}`
}

/**
 * What one release step gives: its value, or why the release stops there
 * (everything before it was done).
 */
type Step<T> = { ok: true; value: T } | { ok: false; error: string }

const stop = (error: string): { ok: false; error: string } => ({
    ok: false,
    error,
})

/** Runs git in `cwd`: its trimmed output, or why it failed. */
const git = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<Step<string>> => {
    const result = await runCommand({ cmd: ['git', ...args], cwd })
    return result.exit_code === 0
        ? { ok: true, value: result.stdout.trim() }
        : stop(
              `git ${args.join(' ')} failed in ${cwd}: ${result.stderr.trim()}`
          )
}

/** The ref names in `git ls-remote` output, without their `refs/.../` prefix. */
const remoteNames = ({ text, prefix }: { text: string; prefix: string }) =>
    text
        .split('\n')
        .map((line) => line.split('\t')[1] ?? '')
        .filter((ref) => ref.startsWith(prefix))
        .map((ref) => ref.slice(prefix.length))

/** Step 1: `main` is checked out, clean, and the same commit as `origin/main`. */
const checkCleanMain = async ({
    repo,
}: {
    repo: string
}): Promise<Step<string>> => {
    const branch = await runCommand({
        cmd: ['git', 'symbolic-ref', '--quiet', '--short', 'HEAD'],
        cwd: repo,
    })
    const on = branch.stdout.trim()
    if (branch.exit_code !== 0 || on !== 'main') {
        return stop(
            `The working copy is on ${on === '' ? 'no branch' : `branch ${on}`}, not main. Check out main first.`
        )
    }
    const status = await git({ cwd: repo, args: ['status', '--porcelain'] })
    if (!status.ok) return status
    if (status.value !== '') {
        return stop(
            `main has uncommitted changes. Commit or remove them first:\n${status.value}`
        )
    }
    const local = await git({ cwd: repo, args: ['rev-parse', 'main'] })
    if (!local.ok) return local
    const listed = await git({
        cwd: repo,
        args: ['ls-remote', 'origin', 'refs/heads/main'],
    })
    if (!listed.ok) return listed
    const remote = listed.value.split('\t')[0]
    if (remote !== local.value) {
        return stop(
            `main (${local.value.slice(0, 12)}) doesn't match origin/main (${remote === '' ? 'missing' : remote?.slice(0, 12)}). Pull or push until they match, then try again.`
        )
    }
    return local
}

/** Step 3: every gate in the repo's `.luca/config.json` passes. */
const checkGates = async ({
    repo,
    log,
}: {
    repo: string
    log: (line: string) => void
}): Promise<Step<null>> => {
    const loaded = await loadEngineConfig({ repo_root: repo })
    if (!loaded.ok) return stop(loaded.error)
    const reports = await mkdtemp(join(tmpdir(), 'luca-release-gates-'))
    try {
        const { ok, checks } = await runGates({
            cwd: repo,
            config: loaded.config,
            test_files: [],
            report_file: join(reports, 'junit.xml'),
            install: null,
        })
        for (const check of checks) {
            log(
                `[luca-release] gate ${check.name}: ${check.ok ? 'passed' : 'failed'}`
            )
        }
        const failed = checks.find((check) => !check.ok)
        if (!ok && failed !== undefined) {
            return stop(
                `The ${failed.name} gate failed (${failed.command}):\n${failed.output}`
            )
        }
        return { ok: true, value: null }
    } finally {
        await rm(reports, { recursive: true, force: true })
    }
}

/** Step 4: picks today's tag, then creates and pushes it at `sha`. */
const tagRelease = async ({
    repo,
    sha,
    date,
}: {
    repo: string
    sha: string
    date: Date
}): Promise<Step<string>> => {
    const local = await git({ cwd: repo, args: ['tag', '--list', 'luca-*'] })
    if (!local.ok) return local
    const listed = await git({
        cwd: repo,
        args: ['ls-remote', '--tags', '--refs', 'origin', 'luca-*'],
    })
    if (!listed.ok) return listed
    const remote = remoteNames({ text: listed.value, prefix: 'refs/tags/' })
    const tag = nextReleaseTag({
        date,
        existing: uniq([...local.value.split('\n'), ...remote]),
    })
    const tagged = await git({
        cwd: repo,
        args: ['tag', '-a', tag, '-m', `Luca release ${tag}`, sha],
    })
    if (!tagged.ok) return tagged
    const pushed = await runCommand({
        cmd: ['git', 'push', '-q', 'origin', `refs/tags/${tag}`],
        cwd: repo,
    })
    if (pushed.exit_code !== 0) {
        await runCommand({ cmd: ['git', 'tag', '-d', tag], cwd: repo })
        return stop(`Couldn't push the tag ${tag}: ${pushed.stderr.trim()}`)
    }
    return { ok: true, value: tag }
}

/**
 * Step 5: the pinned clone (made on first use) fetches the tag, checks it
 * out, and installs from the lockfile.
 */
const movePinnedClone = async ({
    repo,
    pinned_dir,
    tag,
}: {
    repo: string
    pinned_dir: string
    tag: string
}): Promise<Step<null>> => {
    if (!existsSync(join(pinned_dir, '.git'))) {
        if (existsSync(pinned_dir) && readdirSync(pinned_dir).length > 0) {
            return stop(
                `${pinned_dir} exists but is not a clone of Luca. Move it away, then try again.`
            )
        }
        const url = await git({
            cwd: repo,
            args: ['remote', 'get-url', 'origin'],
        })
        if (!url.ok) return url
        await mkdir(dirname(pinned_dir), { recursive: true })
        const cloned = await git({
            cwd: dirname(pinned_dir),
            args: ['clone', '-q', '--no-checkout', url.value, pinned_dir],
        })
        if (!cloned.ok) return cloned
    }
    const fetched = await git({
        cwd: pinned_dir,
        args: ['fetch', '-q', 'origin', `refs/tags/${tag}:refs/tags/${tag}`],
    })
    if (!fetched.ok) return fetched
    const checked_out = await git({
        cwd: pinned_dir,
        args: ['checkout', '-q', '--detach', `refs/tags/${tag}`],
    })
    if (!checked_out.ok) return checked_out
    // The Bun running this command, so it needn't be on PATH.
    const installed = await runCommand({
        cmd: [process.execPath, 'install', '--frozen-lockfile'],
        cwd: pinned_dir,
    })
    if (installed.exit_code !== 0) {
        return stop(
            `${FROZEN_INSTALL} failed in ${pinned_dir}:\n${installed.stdout}\n${installed.stderr}`
        )
    }
    return { ok: true, value: null }
}

/**
 * Makes a release of `repo` (the development working copy) and switches to
 * it. In order, each step only if the one before it worked: checks for a
 * clean `main` that matches `origin/main`; checks that no run is going;
 * runs the gates from `.luca/config.json`; creates and pushes today's tag
 * (`nextReleaseTag`); moves the pinned clone at `pinned_dir` to it (made on
 * first use) and installs from the lockfile; installs the `luca-board`
 * plugin from the pinned clone; and sets its `engine_path` to the pinned
 * `luca-run`. Never throws: a refusal or a failed step ends it with
 * `ok: false` and a plain message.
 *
 * @example
 * const end = await runRelease({
 *     repo, pinned_dir: defaultPinnedDir({ home_dir: homedir() }),
 *     runs_dir: defaultRunsDir(), registry_path, paseo,
 *     now: Date.now, log: console.log,
 * })
 */
export const runRelease = async ({
    repo,
    pinned_dir,
    runs_dir,
    registry_path,
    paseo,
    now,
    log,
}: {
    repo: string
    pinned_dir: string
    runs_dir: string
    registry_path: string
    paseo: ReleasePaseo
    now: () => number
    log: (line: string) => void
}): Promise<RunEnd> => {
    let tag: string | null = null
    const stopped = (reason: string): RunEnd => {
        const message =
            tag === null
                ? `Refused: ${reason}`
                : `Stopped after pushing ${tag}: ${reason}`
        log(`[luca-release] ${message}`)
        return { ok: false, message }
    }
    try {
        const clean = await checkCleanMain({ repo })
        if (!clean.ok) return stopped(clean.error)
        const sha = clean.value
        log(
            `[luca-release] main is clean and matches origin/main (${sha.slice(0, 12)})`
        )

        const going = await goingRuns({ runs_dir, registry_path })
        if (!going.ok) return stopped(going.error)
        if (going.runs.length > 0) {
            return stopped(
                `Runs are going, so a release would change their engine halfway. Wait for them to end (or stop them), then try again:\n${going.runs.map(describeRun).join('\n')}`
            )
        }
        log('[luca-release] no run is going')

        const gates = await checkGates({ repo, log })
        if (!gates.ok) return stopped(gates.error)

        const tagged = await tagRelease({ repo, sha, date: new Date(now()) })
        if (!tagged.ok) return stopped(tagged.error)
        tag = tagged.value
        log(`[luca-release] tagged and pushed ${tag}`)

        const moved = await movePinnedClone({ repo, pinned_dir, tag })
        if (!moved.ok) return stopped(moved.error)
        log(
            `[luca-release] ${pinned_dir} is at ${tag}, installed from the lockfile`
        )

        await paseo.installPlugin({
            path: join(pinned_dir, 'packages', 'board'),
            id: BOARD_PLUGIN_ID,
        })
        const engine_path = join(
            pinned_dir,
            'packages',
            'engine',
            'src',
            'cli',
            'luca-run.ts'
        )
        await paseo.setEnginePath({ plugin_id: BOARD_PLUGIN_ID, engine_path })
        log(
            `[luca-release] ${BOARD_PLUGIN_ID} installed, engine path ${engine_path}`
        )

        const message = `Luca ${tag} is live in ${pinned_dir}. Run /reload-skills in a Paseo chat so it picks up the new plugin.`
        log(`[luca-release] ${message}`)
        return { ok: true, message }
    } catch (error) {
        // Such as a Paseo call that failed.
        return stopped(error instanceof Error ? error.message : String(error))
    }
}
