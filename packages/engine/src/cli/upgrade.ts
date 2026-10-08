import type { PaseoPlugins } from './computer-adapters'
import { reason, type DoctorCheck } from './doctor-checks'
import { describeRun, goingRuns } from './going-runs'
import type { ListProcesses } from './live-runs'
import { resumeCommand } from './run-modes'
import {
    boardFingerprint,
    finishUpgrade,
    type UpgradeEnd,
} from './upgrade-finish'

import { LUCA_PACKAGE } from '../config/luca-version'

/**
 * `luca upgrade`: moves this computer to another published version of Luca,
 * never under a going run.
 *
 * 1. Refuses while any run is going (limit waits and stuck runs included)
 *    and lists them by spec and repo. A run is going when `ps` shows its
 *    engine, or its engine is gone but the board will restart it; when `ps`
 *    fails, every unfinished run is (see `goingRuns`). An unfinished run
 *    nothing runs (such as a crash) doesn't stop it: upgrade says how to
 *    resume it on the new version.
 * 2. Picks the version: `to` exactly when given, older ones included (the
 *    way back from a broken version). Without it, the installed version's
 *    channel: an alpha install gets the `alpha` tag, any other gets
 *    `latest`. Without `to` it never installs a version older than the
 *    installed one, and never a version before v14.
 * 3. Runs `bun add -g @alecsibilia/luca@<version>`.
 * 4. Reloads the board in Paseo, keeping its settings, and rewrites its
 *    engine and Bun paths (see `setUpBoard`).
 * 5. Says when `/reload-skills` is needed: when the board's files changed.
 * 6. Copies Luca's own skills (every one in the new install's `skills/`)
 *    into `~/.claude/skills` (see `installLucaSkills`).
 * 7. Ends with doctor's computer checks (see `computerChecks`).
 *
 * Steps 4-7 (`finishUpgrade`) run in the new install, not in this process
 * (#529): this process runs the old version's code, which doesn't know
 * what the new version's board setup, skills, and checks are. So after
 * step 3 upgrade hands off to the new install's `luca upgrade --finish`,
 * passes its exit code through, and doesn't run them itself. A new install
 * that can't finish (a version from before #529, such as a downgrade's)
 * gets them from this process, as before.
 *
 * npm's registry, Bun, Paseo, `ps`, the new install, and the computer
 * checks are adapters, so tests use fakes.
 */

/** npm's registry lookups for `@alecsibilia/luca`. */
export type NpmRegistry = {
    /** The package's dist-tags, such as `{ latest: '13.0.1', alpha: '14.0.0-alpha.5' }`. */
    distTags: () => Promise<Record<string, string>>
}

/** Bun's global installs. */
export type BunGlobal = {
    /** `bun add -g <spec>`. */
    addGlobal: (args: { spec: string }) => Promise<void>
}

export type { UpgradeEnd }

/** How handing the last steps to the new install went. */
export type HandOff =
    /** The new install ran them; it exited with `exit_code`. */
    | { handed_off: true; exit_code: number }
    /** The new install can't run them, and `why` (one sentence, no period). */
    | { handed_off: false; why: string }

/** The newly installed Luca. */
export type NewInstall = {
    /**
     * Runs `luca upgrade --finish` in the new install of `version`, which
     * prints its own lines; or says why it can't. Throws when the new
     * install couldn't be started.
     */
    finish: (args: {
        version: string
        /** The board folder's fingerprint before the install. */
        board_before: string | null
    }) => Promise<HandOff>
}

/** The first version of new Luca; without `--to`, nothing older is installed. */
const FIRST_NEW_MAJOR = 14

/** A version like `14.0.0` or `14.0.0-alpha.3`. */
const SEMVER = /^(\d+)\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** A version's major, or `null` when it isn't a version (such as a dev copy). Pure. */
const majorOf = (version: string): number | null => {
    const match = SEMVER.exec(version)
    return match?.[1] === undefined ? null : Number(match[1])
}

/**
 * The dist-tag an install follows: `alpha` for an alpha version, otherwise
 * `latest`. Pure.
 *
 * @example
 * channelOf('14.0.0-alpha.3') // 'alpha'
 * channelOf('14.1.0') // 'latest'
 */
export const channelOf = (version: string): 'alpha' | 'latest' =>
    /-alpha(?:\.|$)/.test(version) ? 'alpha' : 'latest'

/**
 * The version to install without `--to`: the installed version's channel
 * tag, or why there is none. Never older than `installed`, never before
 * v14. Pure.
 *
 * @example
 * channelTarget({ installed: '14.0.0-alpha.3', dist_tags: { latest: '13.0.1', alpha: '14.0.0-alpha.5' } })
 * // { ok: true, version: '14.0.0-alpha.5' }
 */
export const channelTarget = ({
    installed,
    dist_tags,
}: {
    installed: string
    dist_tags: Record<string, string>
}): { ok: true; version: string } | { ok: false; error: string } => {
    const channel = channelOf(installed)
    const version = dist_tags[channel]
    if (version === undefined) {
        return {
            ok: false,
            error: `${LUCA_PACKAGE} has no ${channel} version on npm. Use --to <version> to pick one.`,
        }
    }
    const major = majorOf(version)
    if (major === null || major < FIRST_NEW_MAJOR) {
        return {
            ok: false,
            error: `${LUCA_PACKAGE}'s ${channel} is ${version}, older than Luca v${FIRST_NEW_MAJOR}, so it wasn't installed. Use --to <version> to pick one.`,
        }
    }
    if (
        majorOf(installed) !== null &&
        Bun.semver.order(version, installed) < 0
    ) {
        return {
            ok: false,
            error: `${LUCA_PACKAGE}'s ${channel} is ${version}, older than the installed ${installed}, so it wasn't installed. Use --to ${version} to go back to it.`,
        }
    }
    return { ok: true, version }
}

/**
 * Runs `luca upgrade`: refuses while a run is going, picks the version,
 * installs it with Bun, then hands the last steps to `new_install` (see
 * `finishUpgrade`), or runs them here when it can't take them. Never
 * throws: a refusal, a failed step, or a check that is a problem ends it
 * with `ok: false`.
 *
 * @example
 * const end = await runUpgrade({ to: null, home: homedir(), installed_version: lucaVersion(), runs_dir: defaultRunsDir(), registry_path, list_processes: listProcesses, npm, bun, paseo, board_dir, skills_dir, engine_path, bun_path, new_install, computer_checks, log: console.log })
 */
export const runUpgrade = async ({
    to,
    home,
    installed_version,
    runs_dir,
    registry_path,
    list_processes,
    npm,
    bun,
    paseo,
    board_dir,
    skills_dir,
    engine_path,
    bun_path,
    new_install,
    computer_checks,
    log,
}: {
    /** `--to <version>`, or `null` to stay on the installed channel. */
    to: string | null
    /** The home folder, whose `.claude/skills` gets Luca's own skills. */
    home: string
    /** The version of Luca installed now. */
    installed_version: string
    runs_dir: string
    /** The board's run registry. */
    registry_path: string
    /** Every running process's command line, to tell live engines from gone ones. */
    list_processes: ListProcesses
    npm: NpmRegistry
    bun: BunGlobal
    paseo: PaseoPlugins
    /** The board folder inside Luca's install folder. */
    board_dir: string
    /** The skills folder inside Luca's install folder. */
    skills_dir: string
    /** The real path of the installed `luca-run`. */
    engine_path: string
    /** Bun's own path. */
    bun_path: string
    /** The install `bun add -g` makes, which finishes the upgrade. */
    new_install: NewInstall
    /**
     * Doctor's computer checks of the new install, run after the board
     * reload when this process runs the last steps; none when not given.
     */
    computer_checks?: () => Promise<DoctorCheck[]>
    log: (line: string) => void
}): Promise<UpgradeEnd> => {
    const say = ({ message, ok }: UpgradeEnd): UpgradeEnd => {
        log(`[luca upgrade] ${message}`)
        return { ok, message }
    }
    try {
        const going = await goingRuns({
            runs_dir,
            registry_path,
            list_processes,
        })
        if (!going.ok) {
            return say({ message: `Refused: ${going.error}`, ok: false })
        }
        if (going.runs.length > 0) {
            const unchecked =
                going.ps_error === null
                    ? ''
                    : ` Luca couldn't list the processes (${going.ps_error}), so every unfinished run counts as going.`
            return say({
                message: `Refused: runs are going, so an upgrade would change their engine halfway.${unchecked} Wait for them to end (or stop them), then try again:\n${going.runs.map(describeRun).join('\n')}`,
                ok: false,
            })
        }
        log('[luca upgrade] no run is going')
        if (going.stopped.length > 0) {
            log(
                `[luca upgrade] These runs stopped before they ended, and nothing runs them now. They don't stop the upgrade. To go on with one on the new version, after the upgrade:\n${going.stopped.map((run) => `${describeRun(run)}: ${resumeCommand(run)}`).join('\n')}`
            )
        }

        let version: string
        if (to !== null) {
            version = to
        } else {
            const target = channelTarget({
                installed: installed_version,
                dist_tags: await npm.distTags(),
            })
            if (!target.ok) return say({ message: target.error, ok: false })
            version = target.version
        }
        if (version === installed_version) {
            return say({
                message: `Luca ${version} is already installed.`,
                ok: true,
            })
        }

        const before = await boardFingerprint(board_dir)
        const spec = `${LUCA_PACKAGE}@${version}`
        log(`[luca upgrade] installing ${spec} (from ${installed_version})`)
        await bun.addGlobal({ spec })
        log(`[luca upgrade] installed ${spec}`)

        let hand_off: HandOff
        try {
            hand_off = await new_install.finish({
                version,
                board_before: before,
            })
        } catch (error) {
            return say({
                message: `Luca ${version} is installed, but Luca couldn't start it to finish the upgrade (${reason(error)}). Run luca init to finish: it reloads the board and copies Luca's skills.`,
                ok: false,
            })
        }
        if (hand_off.handed_off) {
            // The new install printed its own lines, its last one included.
            return hand_off.exit_code === 0
                ? { ok: true, message: `Luca ${version} is installed.` }
                : say({
                      message: `Luca ${version} is installed, but its last steps failed (exit ${hand_off.exit_code}). See above for what to fix.`,
                      ok: false,
                  })
        }
        log(
            `[luca upgrade] ${hand_off.why}, so Luca ${installed_version} does the last steps.`
        )
        return await finishUpgrade({
            version,
            board_before: before,
            home,
            paseo,
            board_dir,
            skills_dir,
            engine_path,
            bun_path,
            computer_checks,
            log,
        })
    } catch (error) {
        // Such as a failed `bun add -g` or registry lookup.
        return say({ message: reason(error), ok: false })
    }
}
