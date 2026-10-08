/**
 * `luca init`: sets up this computer for Luca. Run it once; running it
 * again is safe:
 *
 *   luca init [--skip-muninndb] [--skip-skills]
 *
 * It installs and starts MuninnDB, adds it to Claude Code at user scope,
 * and writes a login item that starts it at login. `--skip-muninndb` skips
 * all of that: runs then have memory off. It puts the board into Paseo from
 * Luca's own install folder and writes its engine and Bun paths, asking
 * before it turns Paseo's plugins on. It installs the planning skills that
 * aren't there yet; `--skip-skills` skips them. Inside a git repo, it then
 * runs `luca setup` for that repo. See `runInit`.
 *
 * Exits 0 when done, 1 when a step failed, 2 on bad flags.
 */
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { Ask } from './computer-adapters'
import {
    claudeOf,
    computerOf,
    failure,
    lucaInstall,
    muninnHealth,
    muninnOf,
    paseoOf,
} from './computer-adapters-real'
import { reason } from './doctor-checks'
import { runInit, type Launchctl, type SkillsTool } from './init'
import { githubOf, memoryOf, repoTop } from './repo-adapters-real'

import type { MemoryClient } from '../memory/memory-client'
import { runCommand } from '../shell/run-command'

/** `luca init`'s flags. */
const INIT_FLAGS = ['--skip-muninndb', '--skip-skills']

/** `luca init`'s usage line. */
export const INIT_USAGE = 'Usage: luca init [--skip-muninndb] [--skip-skills]'

/** `launchctl`, in the signed-in user's GUI domain. */
const launchctlOf = ({ home }: { home: string }): Launchctl => {
    const domain = `gui/${process.getuid?.() ?? 501}`
    return {
        loaded: async ({ label }) =>
            (
                await runCommand({
                    cmd: ['launchctl', 'print', `${domain}/${label}`],
                    cwd: home,
                })
            ).exit_code === 0,
        load: async ({ plist }) => {
            const end = await runCommand({
                cmd: ['launchctl', 'bootstrap', domain, plist],
                cwd: home,
            })
            if (end.exit_code !== 0) {
                throw failure({ what: `launchctl bootstrap ${plist}`, end })
            }
        },
    }
}

/** Asks in the terminal; anything but yes is no. */
const askInTerminal: Ask = async ({ question }) => confirm(question)

/**
 * The `skills` tool, run with Bun. The installed skills are the folders in
 * the user's global skill folders.
 */
const skillsOf = ({ home }: { home: string }): SkillsTool => ({
    installedSkills: async () => {
        const names = new Set<string>()
        for (const folder of [
            join(home, '.claude', 'skills'),
            join(home, '.agents', 'skills'),
        ]) {
            for (const name of await readdir(folder).catch(() => [])) {
                names.add(name)
            }
        }
        return [...names]
    },
    installSkills: async ({ source, skills }) => {
        const end = await runCommand({
            cmd: [
                process.execPath,
                'x',
                'skills',
                'add',
                source,
                '--global',
                '--agent',
                'claude-code',
                '--yes',
                ...skills.flatMap((skill) => ['--skill', skill]),
            ],
            cwd: home,
        })
        if (end.exit_code !== 0) {
            throw failure({ what: `skills add ${source}`, end })
        }
    },
})

/**
 * MuninnDB over MCP, found on first use: init writes Claude Code's `muninn`
 * entry before its repo part reads it.
 */
const lazyMemory = (): MemoryClient => {
    let client: Promise<MemoryClient> | null = null
    const found = () => (client ??= memoryOf())
    return {
        recall: async (args) => (await found()).recall(args),
        remember: async (args) => (await found()).remember(args),
        evolve: async (args) => (await found()).evolve(args),
        feedback: async (args) => (await found()).feedback(args),
        close: async () => {
            if (client !== null) await (await client).close()
        },
    }
}

/** Runs `luca init` with the flags after `init`; returns the exit code. */
export const initCommand = async ({
    argv,
}: {
    argv: string[]
}): Promise<number> => {
    if (argv.some((flag) => !INIT_FLAGS.includes(flag))) {
        console.error(INIT_USAGE)
        return 2
    }
    const home = homedir()
    const paseo = paseoOf({ client_id: 'luca-init' })
    const memory = lazyMemory()
    try {
        const top = await repoTop({ cwd: process.cwd() })
        const end = await runInit({
            home,
            skip_muninndb: argv.includes('--skip-muninndb'),
            skip_skills: argv.includes('--skip-skills'),
            repo:
                top === null
                    ? null
                    : {
                          path: top,
                          github: await githubOf({ cwd: top }),
                          memory,
                      },
            muninn: muninnOf({ home }),
            muninn_health: muninnHealth,
            claude: claudeOf({ home }),
            launchctl: launchctlOf({ home }),
            paseo,
            skills: skillsOf({ home }),
            ask: askInTerminal,
            computer: computerOf({ home }),
            ...(await lucaInstall()),
            env: process.env,
            log: (line) => {
                console.log(line)
            },
        })
        return end.ok ? 0 : 1
    } catch (error) {
        console.error(`[luca init] ${reason(error)}`)
        return 1
    } finally {
        await paseo.close()
        await memory.close().catch(() => undefined)
    }
}
