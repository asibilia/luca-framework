/**
 * Doctor check: legacy `@alecsibilia/luca-framework` still installed globally.
 *
 * v13 ships as the umbrella package `@alecsibilia/luca`. The pre-v13
 * package `@alecsibilia/luca-framework` exposes the SAME `luca` binary, so
 * having both installed globally is a conflict — whichever was installed
 * last owns the `luca` symlink, and an upgrade/reinstall of the legacy one
 * can silently shadow v13. This check detects the leftover legacy global
 * install (Bun's global prefix, the repo's package manager) and points at
 * the one-line removal.
 *
 * Informational (warning) with a `fixCommand`; no automatic `fix()` —
 * uninstalling a global package on the user's behalf is heavier than this
 * check should do unprompted.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { CheckResult, DoctorCheck } from '../types'

const CHECK_NAME = 'Legacy global package'

const LEGACY = '@alecsibilia/luca-framework'
const UMBRELLA = '@alecsibilia/luca'

/** Bun's global node_modules dir (honors `BUN_INSTALL`, defaults to ~/.bun). */
function bunGlobalNodeModules(): string {
    const bunInstall = process.env.BUN_INSTALL ?? join(homedir(), '.bun')
    return join(bunInstall, 'install', 'global', 'node_modules')
}

/** A package is installed when its package.json exists under the prefix. */
function isInstalled(nodeModules: string, pkg: string): boolean {
    return existsSync(join(nodeModules, pkg, 'package.json'))
}

export const legacyPackageCheck: DoctorCheck = {
    name: CHECK_NAME,
    scope: 'global',

    async run(): Promise<CheckResult> {
        const nm = bunGlobalNodeModules()
        const legacyInstalled = isInstalled(nm, LEGACY)

        if (!legacyInstalled) {
            return {
                name: CHECK_NAME,
                status: 'pass',
                message: `no legacy ${LEGACY} global install`,
                fixCommand: null,
                details: null,
            }
        }

        const umbrellaInstalled = isInstalled(nm, UMBRELLA)
        const conflict = umbrellaInstalled
            ? `Both ${UMBRELLA} and ${LEGACY} are installed globally — they `
              + `provide the same \`luca\` binary, so the active one is whichever `
              + `was installed last.`
            : `The pre-v13 ${LEGACY} is still installed globally; install `
              + `${UMBRELLA} for the v13 CLI.`

        return {
            name: CHECK_NAME,
            status: 'warning',
            message: `legacy ${LEGACY} installed globally (conflicts with ${UMBRELLA})`,
            fixCommand: `bun rm -g ${LEGACY}`,
            details: [
                conflict,
                `Remove the legacy package: bun rm -g ${LEGACY}`,
                `(reversible — \`bun add -g ${LEGACY}\` reinstalls it).`,
            ].join('\n  '),
        }
    },
}
