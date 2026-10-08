/**
 * `luca upgrade`: moves this computer to another published version of
 * Luca, never while a run is going (its engine is running, or the board
 * will restart it):
 *
 *   luca upgrade [--to <version>]
 *
 * Without `--to`, it stays on the installed version's channel (`alpha`
 * stays `alpha`, otherwise `latest`) and never goes back to v13. `--to`
 * installs that exact version, older ones included. Then it reloads the
 * board in Paseo, keeping its settings, and ends with `luca doctor`'s
 * computer checks. See `runUpgrade`.
 *
 * Those last steps run in the version just installed (#529): upgrade
 * hands off to it, as
 *
 *   luca upgrade --finish [--board-before <fingerprint>]
 *
 * which only Luca runs. It doesn't check for going runs or install
 * anything: it reloads the board, copies Luca's skills, and runs the
 * checks, with its own code. See `finishUpgrade`.
 *
 * Exits 0 when done, 1 when it refused or a step failed, 2 on bad flags.
 */
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { z } from 'zod'

import type { Paseo } from './computer-adapters'
import {
    claudeOf,
    computerOf,
    lucaInstall,
    muninnHealth,
    muninnOf,
    packageOf,
    paseoOf,
} from './computer-adapters-real'
import { computerChecks } from './computer-checks'
import { reason } from './doctor-checks'
import { defaultRegistryPath } from './going-runs'
import { listProcesses } from './live-runs'
import {
    runUpgrade,
    type BunGlobal,
    type HandOff,
    type NewInstall,
    type NpmRegistry,
} from './upgrade'
import { finishUpgrade } from './upgrade-finish'

import { LUCA_PACKAGE } from '../config/luca-version'
import { defaultRunsDir } from '../journal/journal'
import { runCommand } from '../shell/run-command'

/** `luca upgrade`'s usage line. */
export const UPGRADE_USAGE = 'Usage: luca upgrade [--to <version>]'

/** npm's public registry. */
const NPM_REGISTRY = 'https://registry.npmjs.org'

const PackumentSchema = z.looseObject({
    'dist-tags': z.record(z.string(), z.string()),
})

/** npm's registry over HTTP, for Luca's package. */
const npmOf = (): NpmRegistry => ({
    distTags: async () => {
        const url = `${NPM_REGISTRY}/${LUCA_PACKAGE.replace('/', '%2f')}`
        const response = await fetch(url, {
            headers: { accept: 'application/vnd.npm.install-v1+json' },
            signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) {
            throw new Error(
                `Couldn't read ${LUCA_PACKAGE} from npm (${response.status} ${response.statusText})`
            )
        }
        return PackumentSchema.parse(await response.json())['dist-tags']
    },
})

/** `bun add -g`, with the Bun running this command. */
const bunOf = ({ home }: { home: string }): BunGlobal => ({
    addGlobal: async ({ spec }) => {
        const end = await runCommand({
            cmd: [process.execPath, 'add', '-g', spec],
            cwd: home,
        })
        if (end.exit_code !== 0) {
            throw new Error(
                `bun add -g ${spec} failed (exit ${end.exit_code}): ${(end.stderr.trim() || end.stdout.trim()).slice(0, 500)}`
            )
        }
    },
})

/**
 * The new install's file older Luca looks for (see `upgrade-finish.ts`):
 * next to its `luca.ts` when it can run `luca upgrade --finish`.
 */
const FINISH_MODULE = 'upgrade-finish.ts'

/**
 * The new install's `luca` entry, when it is `version` of Luca and can
 * finish an upgrade; otherwise why not, in one sentence without a period.
 * Finds it the way the PATH does: the `luca` in Bun's global commands
 * folder (`bun pm bin -g`), which `bun add -g` points at the new install.
 * Read-only.
 *
 * @example
 * await findNewInstall({ bin_dir: '/Users/me/.bun/bin', version: '14.0.0-alpha.11' })
 * // { ok: true, entry: '/Users/me/.bun/install/global/node_modules/@alecsibilia/luca/engine/cli/luca.ts' }
 */
export const findNewInstall = async ({
    bin_dir,
    version,
}: {
    bin_dir: string
    version: string
}): Promise<{ ok: true; entry: string } | { ok: false; why: string }> => {
    const entry = await realpath(join(bin_dir, 'luca')).catch(() => null)
    if (entry === null) {
        return {
            ok: false,
            why: `Bun's global commands folder ${bin_dir} has no luca`,
        }
    }
    const found = await packageOf(entry)
    if (found?.name !== LUCA_PACKAGE || found.version !== version) {
        const what =
            found === null ? entry : `${found.name}@${found.version ?? '?'}`
        return {
            ok: false,
            why: `The luca in ${bin_dir} is ${what}, not ${LUCA_PACKAGE}@${version}`,
        }
    }
    if (!(await Bun.file(join(dirname(entry), FINISH_MODULE)).exists())) {
        return {
            ok: false,
            why: `Luca ${version} can't finish an upgrade itself`,
        }
    }
    return { ok: true, entry }
}

/**
 * Runs `luca upgrade --finish` from `entry` with `bun_path`, its output
 * going straight to this terminal; resolves to its exit code. Throws when
 * it can't be started.
 */
export const handOff = async ({
    bun_path,
    entry,
    board_before,
    cwd,
}: {
    bun_path: string
    entry: string
    board_before: string | null
    cwd: string
}): Promise<HandOff> => {
    const child = Bun.spawn({
        cmd: [
            bun_path,
            entry,
            'upgrade',
            '--finish',
            ...(board_before === null ? [] : ['--board-before', board_before]),
        ],
        cwd,
        stdio: ['inherit', 'inherit', 'inherit'],
    })
    return { handed_off: true, exit_code: await child.exited }
}

/**
 * The install `bun add -g` just made: found with `findNewInstall`, and
 * handed the last steps with `handOff`. When it isn't found, or can't
 * finish, says why, and this process runs them.
 */
const newInstallOf = ({ home }: { home: string }): NewInstall => ({
    finish: async ({ version, board_before }) => {
        const bin = await runCommand({
            cmd: [process.execPath, 'pm', 'bin', '-g'],
            cwd: home,
            timeout_ms: 30_000,
        })
        if (bin.exit_code !== 0) {
            return {
                handed_off: false,
                why: `Bun didn't say where its global commands are (bun pm bin -g exited ${bin.exit_code})`,
            }
        }
        const found = await findNewInstall({
            bin_dir: bin.stdout.trim(),
            version,
        })
        if (!found.ok) return { handed_off: false, why: found.why }
        return handOff({
            bun_path: process.execPath,
            entry: found.entry,
            board_before,
            cwd: home,
        })
    },
})

/** What `luca upgrade`'s flags ask for. */
export type UpgradeArgs =
    /** `luca upgrade [--to <version>]`; `to` is `null` without `--to`. */
    | { finish: false; to: string | null }
    /** `luca upgrade --finish [--board-before <fingerprint>]`, from an older Luca. */
    | { finish: true; board_before: string | null }

/** A flag's value: not empty and not another flag. */
const isValue = (value: string | undefined): value is string =>
    value !== undefined && value !== '' && !value.startsWith('-')

/**
 * The flags after `upgrade`, or `undefined` when they're bad. Pure.
 *
 * @example
 * parseUpgradeArgs({ argv: ['--to', '14.0.0-alpha.3'] }) // { finish: false, to: '14.0.0-alpha.3' }
 * parseUpgradeArgs({ argv: ['--finish'] }) // { finish: true, board_before: null }
 */
export const parseUpgradeArgs = ({
    argv,
}: {
    argv: string[]
}): UpgradeArgs | undefined => {
    const [flag, value, ...rest] = argv
    if (flag === undefined) return { finish: false, to: null }
    if (flag === '--to' && isValue(value) && rest.length === 0) {
        return { finish: false, to: value }
    }
    if (flag === '--finish' && value === undefined) {
        return { finish: true, board_before: null }
    }
    if (flag === '--finish' && value === '--board-before') {
        const [board_before, ...extra] = rest
        if (isValue(board_before) && extra.length === 0) {
            return { finish: true, board_before }
        }
    }
    return undefined
}

/** Doctor's computer checks of the Luca on disk now. */
const computerChecksOf =
    ({ home, paseo }: { home: string; paseo: Paseo }) =>
    async () =>
        computerChecks({
            home,
            // Read again: an install changes the version on disk.
            ...(await lucaInstall()),
            computer: computerOf({ home }),
            muninn: muninnOf({ home }),
            muninn_health: muninnHealth,
            claude: claudeOf({ home }),
            paseo,
        })

/** Runs `luca upgrade` with the flags after `upgrade`; returns the exit code. */
export const upgradeCommand = async ({
    argv,
}: {
    argv: string[]
}): Promise<number> => {
    const args = parseUpgradeArgs({ argv })
    if (args === undefined) {
        console.error(UPGRADE_USAGE)
        return 2
    }
    const home = homedir()
    const paseo = paseoOf({ client_id: 'luca-upgrade' })
    const log = (line: string) => {
        console.log(line)
    }
    try {
        const { luca_version, ...install } = await lucaInstall()
        if (args.finish) {
            const end = await finishUpgrade({
                version: luca_version,
                board_before: args.board_before,
                home,
                paseo,
                ...install,
                computer_checks: computerChecksOf({ home, paseo }),
                log,
            })
            return end.ok ? 0 : 1
        }
        const end = await runUpgrade({
            to: args.to,
            home,
            installed_version: luca_version,
            runs_dir: defaultRunsDir(),
            registry_path: defaultRegistryPath({
                env: process.env,
                home_dir: home,
            }),
            list_processes: listProcesses,
            npm: npmOf(),
            bun: bunOf({ home }),
            paseo,
            ...install,
            new_install: newInstallOf({ home }),
            computer_checks: computerChecksOf({ home, paseo }),
            log,
        })
        return end.ok ? 0 : 1
    } catch (error) {
        console.error(`[luca upgrade] ${reason(error)}`)
        return 1
    } finally {
        await paseo.close()
    }
}
