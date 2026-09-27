/**
 * `luca upgrade`: moves this computer to another published version of
 * Luca, never while a run is going:
 *
 *   luca upgrade [--to <version>]
 *
 * Without `--to`, it stays on the installed version's channel (`alpha`
 * stays `alpha`, otherwise `latest`) and never goes back to v13. `--to`
 * installs that exact version, older ones included. Then it reloads the
 * board in Paseo, keeping its settings. See `runUpgrade`.
 *
 * Exits 0 when done, 1 when it refused or a step failed, 2 on bad flags.
 */
import { realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import { defaultRegistryPath } from './going-runs'
import { boardDir, paseoOf } from './init-command'
import { runUpgrade, type BunGlobal, type NpmRegistry } from './upgrade'

import { LUCA_PACKAGE, lucaVersion } from '../config/luca-version'
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

/** The `--to` version, `null` without it, or `undefined` on bad flags. */
const parseTo = (argv: string[]): string | null | undefined => {
    if (argv.length === 0) return null
    const [flag, version] = argv
    return flag === '--to' &&
        argv.length === 2 &&
        version !== undefined &&
        version !== '' &&
        !version.startsWith('-')
        ? version
        : undefined
}

/** Runs `luca upgrade` with the flags after `upgrade`; returns the exit code. */
export const upgradeCommand = async ({
    argv,
}: {
    argv: string[]
}): Promise<number> => {
    const to = parseTo(argv)
    if (to === undefined) {
        console.error(UPGRADE_USAGE)
        return 2
    }
    const home = homedir()
    const paseo = paseoOf({ client_id: 'luca-upgrade' })
    try {
        const end = await runUpgrade({
            to,
            installed_version: lucaVersion(),
            runs_dir: defaultRunsDir(),
            registry_path: defaultRegistryPath({
                env: process.env,
                home_dir: home,
            }),
            npm: npmOf(),
            bun: bunOf({ home }),
            paseo,
            board_dir: await boardDir(),
            engine_path: await realpath(join(import.meta.dir, 'luca-run.ts')),
            bun_path: await realpath(process.execPath),
            log: (line) => {
                console.log(line)
            },
        })
        return end.ok ? 0 : 1
    } catch (error) {
        console.error(
            `[luca upgrade] ${error instanceof Error ? error.message : String(error)}`
        )
        return 1
    } finally {
        await paseo.close()
    }
}
