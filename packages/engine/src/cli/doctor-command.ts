/**
 * `luca doctor`: checks this computer, the repo in the current folder when
 * there is one, and what old Luca v13 left behind, and prints each check as
 * OK, or the problem and its exact fix:
 *
 *   luca doctor [--fix]
 *
 * `--fix` fixes what's safe without asking: it moves v13's leftovers to a
 * dated backup, starts MuninnDB, repairs Claude Code's `muninn` entry,
 * reloads the board and rewrites its paths, and runs `luca setup` in a
 * repo. It never deletes and never commits.
 * See `runDoctor`.
 *
 * Exits 0 when no check is a problem, 1 when one is, 2 on bad flags.
 */
import { homedir } from 'node:os'

import { runDoctor } from './doctor'
import {
    claudeOf,
    computerOf,
    lucaInstall,
    muninnHealth,
    muninnOf,
    paseoOf,
} from './init-command'
import { githubOf, memoryOf } from './setup-command'

import type { MemoryClient } from '../memory/memory-client'
import { runCommand } from '../shell/run-command'

/** `luca doctor`'s usage line. */
export const DOCTOR_USAGE = 'Usage: luca doctor [--fix]'

/** The top of the git repo `cwd` is in, or `null` outside one. */
const repoTop = async ({ cwd }: { cwd: string }): Promise<string | null> => {
    const top = await runCommand({
        cmd: ['git', 'rev-parse', '--show-toplevel'],
        cwd,
    })
    return top.exit_code === 0 && top.stdout.trim() !== ''
        ? top.stdout.trim()
        : null
}

/** Runs `luca doctor` with the flags after `doctor`; returns the exit code. */
export const doctorCommand = async ({
    argv,
}: {
    argv: string[]
}): Promise<number> => {
    if (argv.some((flag) => flag !== '--fix')) {
        console.error(DOCTOR_USAGE)
        return 2
    }
    const home = homedir()
    const paseo = paseoOf({ client_id: 'luca-doctor' })
    let memory: MemoryClient | null = null
    try {
        const top = await repoTop({ cwd: process.cwd() })
        memory = top === null ? null : await memoryOf()
        const end = await runDoctor({
            home,
            fix: argv.includes('--fix'),
            ...(await lucaInstall()),
            computer: computerOf({ home }),
            muninn: muninnOf({ home }),
            muninn_health: muninnHealth,
            claude: claudeOf({ home }),
            paseo,
            repo:
                top === null || memory === null
                    ? null
                    : {
                          path: top,
                          github: await githubOf({ cwd: top }),
                          memory,
                      },
            tmp_dir: '/tmp',
            log: (line) => {
                console.log(line)
            },
        })
        return end.exit_code
    } catch (error) {
        console.error(
            `[luca doctor] ${error instanceof Error ? error.message : String(error)}`
        )
        return 1
    } finally {
        await paseo.close()
        await memory?.close().catch(() => undefined)
    }
}
