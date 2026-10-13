import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { setUpBoard } from './board-in-paseo'
import type { PaseoPlugins } from './computer-adapters'
import {
    formatChecks,
    hasProblem,
    reason,
    type DoctorCheck,
} from './doctor-checks'
import { installLucaSkills } from './luca-skills'

/**
 * The last steps of `luca upgrade`, after `bun add -g` (#529): reload the
 * board, say when `/reload-skills` is needed, copy Luca's own skills, and
 * run doctor's computer checks.
 *
 * They run in the newly installed Luca, not the one that installed it:
 * `luca upgrade` hands off to the new install's `luca upgrade --finish`,
 * so the board setup, the skills, and the checks are the new version's.
 *
 * Older Luca looks for this file next to the new install's `luca.ts` to
 * tell whether the new install can finish an upgrade. Don't rename or move
 * it.
 */

/** How upgrade ended; `message` is the last line it printed. */
export type UpgradeEnd = { ok: boolean; message: string }

/**
 * A fingerprint of every file in `dir` but its `node_modules`, or `null`
 * when it can't be read. Short, so it fits on a command line.
 */
export const boardFingerprint = async (dir: string): Promise<string | null> => {
    const lines: string[] = []
    const walk = async (at: string): Promise<void> => {
        const entries = await readdir(at, { withFileTypes: true })
        for (const entry of entries) {
            const path = join(at, entry.name)
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules') await walk(path)
            } else if (entry.isFile()) {
                const bytes = await Bun.file(path).arrayBuffer()
                lines.push(`${path}\t${Bun.hash(bytes)}`)
            }
        }
    }
    try {
        await walk(dir)
    } catch {
        return null
    }
    return Bun.hash(lines.sort().join('\n')).toString(36)
}

/**
 * Runs `luca upgrade`'s last steps for the installed `version`: reloads
 * the board with its settings kept and its paths rewritten, says to run
 * `/reload-skills` when the board's files differ from `board_before`,
 * copies Luca's skills, then prints `computer_checks`. Ends with "Luca
 * <version> is installed." Never throws.
 *
 * @example
 * const end = await finishUpgrade({ version: '14.0.0-alpha.11', board_before, home, paseo, board_dir, skills_dir, engine_path, bun_path, computer_checks, log: console.log })
 */
export const finishUpgrade = async ({
    version,
    board_before,
    home,
    paseo,
    board_dir,
    skills_dir,
    engine_path,
    bun_path,
    computer_checks,
    log,
}: {
    /** The version just installed. */
    version: string
    /** The board folder's fingerprint before the install, or `null` when unknown. */
    board_before: string | null
    /** The home folder, whose `.claude/skills` gets Luca's own skills. */
    home: string
    paseo: PaseoPlugins
    /** The board folder inside Luca's install folder. */
    board_dir: string
    /** The skills folder inside Luca's install folder. */
    skills_dir: string
    /** The real path of the installed `luca-run`. */
    engine_path: string
    /** Bun's own path. */
    bun_path: string
    /** Doctor's computer checks of the new install; none when not given. */
    computer_checks?: () => Promise<DoctorCheck[]>
    log: (line: string) => void
}): Promise<UpgradeEnd> => {
    const say = ({ message, ok }: UpgradeEnd): UpgradeEnd => {
        log(`[luca upgrade] ${message}`)
        return { ok, message }
    }
    try {
        const board = await setUpBoard({
            command: 'luca upgrade',
            paseo,
            // Upgrade only reloads; `luca init` asks to turn plugins on.
            ask: async () => false,
            board_dir,
            engine_path,
            bun_path,
            log,
        })
        if (board.ok) {
            const after = await boardFingerprint(board_dir)
            if (
                board_before === null ||
                after === null ||
                board_before !== after
            ) {
                log(
                    "[luca upgrade] The board's files changed: run /reload-skills in a Paseo chat so its slash commands are up to date."
                )
            }
        }
        const skills = await installLucaSkills({
            home,
            skills_dir,
            prefix: '[luca upgrade]',
            log,
        })
        const end = say({
            message: !board.ok
                ? `Luca ${version} is installed, but the board wasn't reloaded. Run luca init to fix it.`
                : !skills.ok
                  ? `Luca ${version} is installed, but its skills weren't copied. Run luca doctor --fix to fix it.`
                  : `Luca ${version} is installed.`,
            ok: board.ok && skills.ok,
        })
        const checks = (await computer_checks?.()) ?? []
        for (const line of formatChecks({ checks })) log(line)
        return { ...end, ok: end.ok && !hasProblem({ checks }) }
    } catch (error) {
        // Such as computer checks that threw.
        return say({
            message: `Luca ${version} is installed, but its last steps failed: ${reason(error)}`,
            ok: false,
        })
    }
}
