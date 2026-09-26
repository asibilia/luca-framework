/**
 * `luca init`: sets up this computer for Luca. Run it once; running it
 * again is safe:
 *
 *   luca init [--skip-muninndb]
 *
 * It installs and starts MuninnDB, adds it to Claude Code at user scope,
 * and writes a login item that starts it at login. `--skip-muninndb` skips
 * all of that: runs then have memory off. See `runInit`.
 *
 * Exits 0 when done, 1 when a step failed, 2 on bad flags.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'

import { z } from 'zod'

import {
    runInit,
    type ClaudeMcp,
    type Launchctl,
    type McpServer,
    type MuninnCli,
} from './init'

import { runCommand } from '../shell/run-command'

/** `luca init`'s usage line. */
export const INIT_USAGE = 'Usage: luca init [--skip-muninndb]'

/** MuninnDB's official install script. */
const MUNINN_INSTALL_SCRIPT = 'https://muninndb.com/install.sh'

/** Why a command failed, from its output. Pure. */
const failure = ({
    what,
    end,
}: {
    what: string
    end: { exit_code: number | null; stdout: string; stderr: string }
}): Error =>
    new Error(
        `${what} failed (exit ${end.exit_code}): ${(end.stderr.trim() || end.stdout.trim()).slice(0, 500)}`
    )

/** MuninnDB's CLI, found on the PATH or where its install script puts it. */
const muninnOf = ({ home }: { home: string }): MuninnCli => {
    const which = async () => {
        const found = Bun.which('muninn')
        if (found !== null) return found
        for (const candidate of [
            join(home, '.local', 'bin', 'muninn'),
            join(home, 'bin', 'muninn'),
            join(home, '.muninndb', 'bin', 'muninn'),
            '/opt/homebrew/bin/muninn',
            '/usr/local/bin/muninn',
        ]) {
            if (await Bun.file(candidate).exists()) return candidate
        }
        return null
    }
    return {
        which,
        install: async () => {
            // Fetched first, then run, so a failed download isn't masked.
            const script = await runCommand({
                cmd: ['curl', '-fsSL', MUNINN_INSTALL_SCRIPT],
                cwd: home,
            })
            if (script.exit_code !== 0 || script.stdout.trim() === '') {
                throw failure({ what: 'Downloading MuninnDB', end: script })
            }
            const installed = await runCommand({
                cmd: ['sh', '-c', script.stdout],
                cwd: home,
            })
            if (installed.exit_code !== 0) {
                throw failure({ what: "MuninnDB's install", end: installed })
            }
        },
        run: async ({ args }) => {
            const bin = await which()
            if (bin === null) throw new Error('muninn is not installed')
            return runCommand({ cmd: [bin, ...args], cwd: home })
        },
        token: async () => {
            const file = Bun.file(join(home, '.muninn', 'mcp.token'))
            if (!(await file.exists())) return null
            const token = (await file.text()).trim()
            return token === '' ? null : token
        },
    }
}

const ServersSchema = z
    .record(
        z.string(),
        z.looseObject({
            type: z.string().optional(),
            url: z.string().optional(),
            command: z.string().optional(),
            headers: z.record(z.string(), z.string()).optional(),
        })
    )
    .optional()
    .catch(undefined)

const ClaudeJsonSchema = z.looseObject({
    mcpServers: ServersSchema,
    projects: z
        .record(z.string(), z.looseObject({ mcpServers: ServersSchema }))
        .optional()
        .catch(undefined),
})

/** The servers in one `mcpServers` object of `~/.claude.json`. Pure. */
const serversIn = ({
    servers,
    scope,
}: {
    servers: z.infer<typeof ServersSchema>
    scope: McpServer['scope']
}): McpServer[] =>
    Object.entries(servers ?? {}).map(([name, entry]) => ({
        name,
        scope,
        transport:
            entry.type === 'http' || entry.type === 'sse'
                ? entry.type
                : 'stdio',
        url: entry.url ?? '',
        headers: entry.headers ?? {},
    }))

/**
 * Claude Code's `claude mcp`. The list is read from `~/.claude.json` (its
 * top-level servers are user scope, each project's are local scope), as
 * `claude mcp list` checks every server's health and shows no scope.
 */
const claudeOf = ({ home }: { home: string }): ClaudeMcp => ({
    listMcpServers: async () => {
        const file = Bun.file(join(home, '.claude.json'))
        if (!(await file.exists())) return []
        let json: unknown
        try {
            json = JSON.parse(await file.text())
        } catch {
            return []
        }
        const parsed = ClaudeJsonSchema.safeParse(json)
        if (!parsed.success) return []
        return [
            ...serversIn({ servers: parsed.data.mcpServers, scope: 'user' }),
            ...Object.values(parsed.data.projects ?? {}).flatMap(
                ({ mcpServers }) =>
                    serversIn({ servers: mcpServers, scope: 'local' })
            ),
        ]
    },
    addMcpServer: async ({ name, scope, transport, url, headers }) => {
        const end = await runCommand({
            cmd: [
                'claude',
                'mcp',
                'add',
                '--transport',
                transport,
                '--scope',
                scope,
                name,
                url,
                ...Object.entries(headers).flatMap(([key, value]) => [
                    '--header',
                    `${key}: ${value}`,
                ]),
            ],
            cwd: home,
        })
        if (end.exit_code !== 0) {
            throw failure({ what: `claude mcp add ${name}`, end })
        }
    },
    removeMcpServer: async ({ name, scope }) => {
        const end = await runCommand({
            cmd: ['claude', 'mcp', 'remove', '--scope', scope, name],
            cwd: home,
        })
        if (end.exit_code !== 0) {
            throw failure({ what: `claude mcp remove ${name}`, end })
        }
    },
})

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

/** Runs `luca init` with the flags after `init`; returns the exit code. */
export const initCommand = async ({
    argv,
}: {
    argv: string[]
}): Promise<number> => {
    if (argv.some((flag) => flag !== '--skip-muninndb')) {
        console.error(INIT_USAGE)
        return 2
    }
    const home = homedir()
    const end = await runInit({
        home,
        skip_muninndb: argv.includes('--skip-muninndb'),
        muninn: muninnOf({ home }),
        claude: claudeOf({ home }),
        launchctl: launchctlOf({ home }),
        log: (line) => {
            console.log(line)
        },
    })
    return end.ok ? 0 : 1
}
