import {
    computerChecks,
    type Computer,
    type MuninnHealth,
    type Paseo,
} from './computer-checks'
import {
    formatChecks,
    hasProblem,
    reason,
    type DoctorCheck,
} from './doctor-checks'
import {
    ensureMuninnEntry,
    hideToken,
    placeBoard,
    type ClaudeMcp,
    type MuninnCli,
} from './init'
import { repoChecks, runSetup, type SetupGitHub } from './setup'
import {
    fixV13,
    hasV13Leftovers,
    MIGRATION_GUIDE_URL,
    v13Checks,
} from './v13-leftovers'

import type { V13Manifest } from '../doctor/v13-manifest'
import type { MemoryClient } from '../memory/memory-client'
import { runCommand } from '../shell/run-command'

/**
 * `luca doctor [--fix]`: checks this computer, the repo when run inside
 * one, and what old Luca v13 left behind, and prints each check as OK, or
 * the problem and its exact fix. It exits 1 when any check is a problem;
 * warnings (memory off, planning-skill drift) don't fail it. When it finds
 * v13 leftovers, it links the migration guide.
 *
 * `--fix` fixes what's safe, without asking: it cleans up v13's leftovers
 * first (see `fixV13`), starts MuninnDB and repairs Claude Code's `muninn`
 * entry (as `luca init` does), reloads the board and rewrites its paths,
 * and runs `luca setup` in a repo. It never deletes and never commits: it
 * lists the repo files to commit. Installs, sign-ins, Paseo's plugin
 * consent, and other `luca` copies are only reported.
 */

const PREFIX = '[luca doctor]'

/** How long `--fix` waits for MuninnDB to answer after `muninn start`. */
const MUNINN_START_TRIES = 10
const MUNINN_START_WAIT_MS = 500

/** The repo doctor runs in, and its GitHub and memory adapters. */
export type DoctorRepo = {
    path: string
    github: SetupGitHub
    memory: MemoryClient
    base_branch?: string
}

/** How doctor ended: every check, and its exit code. */
export type DoctorEnd = { checks: DoctorCheck[]; exit_code: number }

const statusOf = ({ checks, name }: { checks: DoctorCheck[]; name: string }) =>
    checks.find((check) => check.group === 'computer' && check.name === name)
        ?.status

/** The repo's changed files, as `git status` lists them. */
const changedFiles = async ({ repo }: { repo: string }): Promise<string[]> => {
    const status = await runCommand({
        cmd: ['git', 'status', '--porcelain', '--untracked-files=all'],
        cwd: repo,
    })
    return status.exit_code === 0
        ? status.stdout
              .split('\n')
              .filter((line) => line.trim() !== '')
              .map((line) => line.slice(3))
        : []
}

/** Starts MuninnDB, then waits for it to answer. */
const startMuninn = async ({
    muninn,
    muninn_health,
    log,
}: {
    muninn: MuninnCli
    muninn_health: MuninnHealth
    log: (line: string) => void
}) => {
    const started = await muninn.run({ args: ['start'] })
    if (started.exit_code !== 0) {
        throw new Error(
            `muninn start failed (exit ${started.exit_code}): ${started.stderr.trim()}`
        )
    }
    for (let i = 0; i < MUNINN_START_TRIES; i += 1) {
        if ((await muninn_health()) !== null) break
        await Bun.sleep(MUNINN_START_WAIT_MS)
    }
    log(`${PREFIX} MuninnDB: started`)
}

/** Runs one fix; a failure is logged, and the checks after say what's left. */
const tryFix = async ({
    what,
    run,
    token,
    log,
}: {
    what: string
    run: () => Promise<unknown>
    token: string | null
    log: (line: string) => void
}) => {
    try {
        await run()
    } catch (error) {
        log(
            hideToken({
                text: `${PREFIX} ${what}: ${reason(error)}`,
                token,
            })
        )
    }
}

/** Fixes what's safe on this computer, guided by the checks. */
const fixComputer = async ({
    checks,
    board_dir,
    engine_path,
    bun_path,
    muninn,
    muninn_health,
    claude,
    paseo,
    log,
}: {
    checks: DoctorCheck[]
    board_dir: string
    engine_path: string
    bun_path: string
    muninn: MuninnCli
    muninn_health: MuninnHealth
    claude: ClaudeMcp
    paseo: Paseo
    log: (line: string) => void
}) => {
    const installed = (await muninn.which().catch(() => null)) !== null
    if (
        installed &&
        statusOf({ checks, name: 'muninndb' }) === 'problem' &&
        (await muninn_health().catch(() => null)) === null
    ) {
        await tryFix({
            what: 'MuninnDB',
            run: () => startMuninn({ muninn, muninn_health, log }),
            token: null,
            log,
        })
    }
    if (installed && statusOf({ checks, name: 'muninn_entry' }) === 'problem') {
        const token = await muninn.token().catch(() => null)
        if (token !== null && token !== '') {
            await tryFix({
                what: 'Claude Code',
                run: () =>
                    ensureMuninnEntry({ claude, token, prefix: PREFIX, log }),
                token,
                log,
            })
        }
    }
    if (
        statusOf({ checks, name: 'board' }) === 'problem' &&
        statusOf({ checks, name: 'paseo_plugins' }) === 'ok'
    ) {
        await tryFix({
            what: 'Board',
            run: () =>
                placeBoard({
                    paseo,
                    board_dir,
                    engine_path,
                    bun_path,
                    prefix: PREFIX,
                    log,
                }),
            token: null,
            log,
        })
    }
}

/** Runs `luca setup` in the repo. */
const fixRepo = async ({
    repo,
    log,
}: {
    repo: DoctorRepo
    log: (line: string) => void
}) => {
    await tryFix({
        what: 'luca setup',
        run: () =>
            runSetup({
                repo: repo.path,
                github: repo.github,
                memory: repo.memory,
                base_branch: repo.base_branch,
                log,
            }),
        token: null,
        log,
    })
}

/** Lists the repo files `--fix` changed, for the user to commit. */
const listToCommit = async ({
    repo,
    before,
    log,
}: {
    repo: string
    /** The files `git status` listed before `--fix` ran. */
    before: Set<string>
    log: (line: string) => void
}) => {
    const changed = (await changedFiles({ repo })).filter(
        (file) => !before.has(file)
    )
    if (changed.length > 0) {
        log(
            `${PREFIX} Nothing was committed. Commit these, then merge them to main through a PR: ${changed.join(', ')}`
        )
    }
}

/**
 * Runs `luca doctor` against `home` with these adapters: the computer
 * checks, then the repo checks when `repo` is given, then v13's leftovers
 * in `home`, `repo`, and `tmp_dir`. With `fix`, it fixes what's safe first,
 * then checks again. Never throws, and never shows the token.
 *
 * @example
 * const end = await runDoctor({ home: homedir(), fix: false, luca_version, board_dir, engine_path, bun_path, computer, muninn, muninn_health, claude, paseo, repo: null, tmp_dir: '/tmp', log: console.log })
 * process.exit(end.exit_code)
 */
export const runDoctor = async ({
    home,
    fix,
    luca_version,
    board_dir,
    engine_path,
    bun_path,
    computer,
    muninn,
    muninn_health,
    claude,
    paseo,
    repo,
    tmp_dir,
    v13_manifest,
    log,
}: {
    home: string
    fix: boolean
    /** The installed Luca's version. */
    luca_version: string
    /** The board folder inside Luca's install folder. */
    board_dir: string
    /** The real path of the installed `luca-run`. */
    engine_path: string
    /** Bun's own path. */
    bun_path: string
    computer: Computer
    muninn: MuninnCli
    muninn_health: MuninnHealth
    claude: ClaudeMcp
    paseo: Paseo
    /** The repo doctor runs in, or `null` outside one. */
    repo: DoctorRepo | null
    /** Where v13 left its `luca-*.json` payloads: `/tmp`. */
    tmp_dir: string
    /** The v13 fingerprint list; defaults to the committed one. */
    v13_manifest?: V13Manifest
    log: (line: string) => void
}): Promise<DoctorEnd> => {
    const check = async (): Promise<DoctorCheck[]> => [
        ...(await computerChecks({
            home,
            luca_version,
            board_dir,
            engine_path,
            bun_path,
            computer,
            muninn,
            muninn_health,
            claude,
            paseo,
        })),
        ...(repo === null
            ? []
            : await repoChecks({
                  repo: repo.path,
                  github: repo.github,
                  memory: repo.memory,
                  base_branch: repo.base_branch,
              })),
        ...(await v13Checks({
            manifest: v13_manifest,
            home,
            repo: repo?.path ?? null,
            tmp_dir,
        })),
    ]

    let checks = await check()
    const found_v13 = hasV13Leftovers({ checks })
    if (fix) {
        const before =
            repo === null
                ? new Set<string>()
                : new Set(await changedFiles({ repo: repo.path }))
        // v13's global hook is unwired before anything else.
        if (found_v13) {
            await tryFix({
                what: 'v13 cleanup',
                run: () =>
                    fixV13({
                        manifest: v13_manifest,
                        home,
                        repo: repo?.path ?? null,
                        tmp_dir,
                        log,
                    }),
                token: null,
                log,
            })
        }
        await fixComputer({
            checks,
            board_dir,
            engine_path,
            bun_path,
            muninn,
            muninn_health,
            claude,
            paseo,
            log,
        })
        if (
            repo !== null &&
            checks.some(
                ({ group, status }) => group === 'repo' && status === 'problem'
            )
        ) {
            await fixRepo({ repo, log })
        }
        if (repo !== null) await listToCommit({ repo: repo.path, before, log })
        checks = await check()
    }

    for (const line of formatChecks({ checks })) log(line)
    if (found_v13) {
        log(
            `${PREFIX} Old Luca v13 was here. What changed, and how to move over: ${MIGRATION_GUIDE_URL}`
        )
    }
    const failed = hasProblem({ checks })
    log(
        failed
            ? `${PREFIX} Fix the problems above${fix ? '' : ' (luca doctor --fix fixes the safe ones)'}, then run luca doctor again.`
            : `${PREFIX} All good.`
    )
    return { checks, exit_code: failed ? 1 : 0 }
}
