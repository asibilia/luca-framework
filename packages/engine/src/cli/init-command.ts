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
 * aren't there yet; `--skip-skills` skips them. See `runInit`.
 *
 * Exits 0 when done, 1 when a step failed, 2 on bad flags.
 */
import { readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { DaemonClient } from '@getpaseo/client/internal/daemon-client'
import { z } from 'zod'

import {
    BOARD_PLUGIN_ID,
    LUCA_PACKAGE,
    MUNINN_HEALTH_URL,
    type Computer,
    type LucaCopy,
    type MuninnHealth,
    type Paseo,
} from './computer-checks'
import { versionIn } from './doctor-checks'
import {
    runInit,
    type Ask,
    type ClaudeMcp,
    type Launchctl,
    type McpServer,
    type MuninnCli,
    type SkillsTool,
} from './init'

import { daemonAddress } from '../board/paseo-board-link'
import { runCommand } from '../shell/run-command'
import { ghLogin } from '../tracker/github-tracker'

/** `luca init`'s flags. */
const INIT_FLAGS = ['--skip-muninndb', '--skip-skills']

/** `luca init`'s usage line. */
export const INIT_USAGE = 'Usage: luca init [--skip-muninndb] [--skip-skills]'

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
export const muninnOf = ({ home }: { home: string }): MuninnCli => {
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
export const claudeOf = ({ home }: { home: string }): ClaudeMcp => ({
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

/** The board plugin's settings document that holds its engine settings. */
const ENGINE_SETTINGS_ID = 'engine'

const SettingsReadSchema = z.discriminatedUnion('status', [
    z.object({
        status: z.literal('ready'),
        revision: z.string(),
        values: z.record(z.string(), z.unknown()),
    }),
    z.object({
        status: z.literal('invalid'),
        revision: z.string(),
        error: z.string(),
    }),
])

const SettingsWriteSchema = z.object({
    status: z.string(),
    error: z.string().optional(),
})

const BoardVersionSchema = z.object({ version: z.string().nullable() })

/**
 * Paseo through the local daemon: its version, its `pluginsEnabled` config,
 * its plugins, and the board's settings and version RPCs. Connects on first
 * use as `client_id`; `close` ends it.
 */
export const paseoOf = ({
    client_id,
}: {
    client_id: string
}): Paseo & { close: () => Promise<void> } => {
    let client: DaemonClient | null = null
    const connected = async (): Promise<DaemonClient> => {
        if (client !== null) return client
        const password = process.env.PASEO_PASSWORD
        const fresh = new DaemonClient({
            url: `ws://${await daemonAddress()}/ws`,
            clientId: client_id,
            clientType: 'cli',
            reconnect: { enabled: false },
            connectTimeoutMs: 5000,
            ...(password === undefined || password === '' ? {} : { password }),
        })
        await fresh.connect()
        client = fresh
        return fresh
    }
    /** The settings document's revision, and its values when it's valid. */
    const read = async ({ plugin_id }: { plugin_id: string }) =>
        SettingsReadSchema.parse(
            await (
                await connected()
            ).invokePluginRpc(
                plugin_id,
                `settings.${ENGINE_SETTINGS_ID}.read`,
                {}
            )
        )
    return {
        version: async () => {
            const daemon = await connected()
            // The server's info comes right after connecting; a round trip
            // makes sure it's in.
            if (daemon.getLastServerInfoMessage() === null) {
                await daemon.getDaemonConfig()
            }
            const version = daemon.getLastServerInfoMessage()?.version
            if (version === undefined || version === null) {
                throw new Error("Paseo didn't say its version")
            }
            return version
        },
        boardVersion: async () => {
            const daemon = await connected()
            const board = (await daemon.listPlugins()).find(
                ({ id }) => id === BOARD_PLUGIN_ID
            )
            if (board === undefined) return null
            try {
                const { version } = BoardVersionSchema.parse(
                    await daemon.invokePluginRpc(
                        BOARD_PLUGIN_ID,
                        'board.version',
                        {}
                    )
                )
                return version ?? 'of an unknown version'
            } catch {
                // A board from before `board.version` can't say.
                return 'of an unknown version'
            }
        },
        pluginsEnabled: async () =>
            (await (await connected()).getDaemonConfig()).config
                .pluginsEnabled === true,
        enablePlugins: async () => {
            await (
                await connected()
            ).patchDaemonConfig({ pluginsEnabled: true })
        },
        listPlugins: async () =>
            (await (await connected()).listPlugins()).map(({ id, path }) => ({
                id,
                path,
            })),
        installPlugin: async ({ path, id }) => {
            await (await connected()).installDirectoryPlugin(path, id)
        },
        reloadPlugin: async ({ id }) => {
            await (await connected()).reloadPlugin(id)
        },
        removePlugin: async ({ id }) => {
            await (await connected()).removePlugin(id)
        },
        readSettings: async ({ plugin_id }) => {
            const settings = await read({ plugin_id })
            return settings.status === 'ready' ? settings.values : {}
        },
        writeSettings: async ({ plugin_id, values }) => {
            const { revision } = await read({ plugin_id })
            const written = SettingsWriteSchema.parse(
                await (
                    await connected()
                ).invokePluginRpc(
                    plugin_id,
                    `settings.${ENGINE_SETTINGS_ID}.write`,
                    { revision, values }
                )
            )
            if (written.status !== 'saved') {
                throw new Error(
                    `Couldn't save ${plugin_id}'s settings (${written.status}): ${written.error ?? ''}`
                )
            }
        },
        close: async () => {
            await client?.close().catch(() => undefined)
            client = null
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
 * The board folder in Luca's install folder: `board/` next to `engine/` in
 * the published package, or `packages/board` in a working copy.
 */
export const boardDir = async (): Promise<string> => {
    const candidates = [
        join(import.meta.dir, '..', '..', 'board'),
        join(import.meta.dir, '..', '..', '..', 'board'),
    ]
    for (const candidate of candidates) {
        if (await Bun.file(join(candidate, 'paseo-plugin.json')).exists()) {
            return realpath(candidate)
        }
    }
    throw new Error(
        `No board folder found next to the engine (looked in ${candidates.join(', ')}). Reinstall Luca.`
    )
}

const PackageJsonSchema = z.looseObject({
    name: z.string().optional(),
    version: z.string().optional(),
})

/** The package.json in `dir`, or `null` when it has no readable one. */
const packageIn = async (
    dir: string
): Promise<z.infer<typeof PackageJsonSchema> | null> => {
    const file = Bun.file(join(dir, 'package.json'))
    if (!(await file.exists())) return null
    try {
        const parsed = PackageJsonSchema.safeParse(await file.json())
        return parsed.success ? parsed.data : null
    } catch {
        return null
    }
}

/** Every folder from `dir` up to the root, nearest first. */
const foldersUp = (dir: string): string[] => {
    const folders = [dir]
    while (dirname(folders.at(-1) ?? '/') !== folders.at(-1)) {
        folders.push(dirname(folders.at(-1) ?? '/'))
    }
    return folders
}

/** The package a file belongs to: the nearest package.json with a name. */
const packageOf = async (
    file: string
): Promise<{ name: string; version: string | null } | null> => {
    for (const dir of foldersUp(dirname(file))) {
        const found = await packageIn(dir)
        if (found?.name !== undefined) {
            return { name: found.name, version: found.version ?? null }
        }
    }
    return null
}

/**
 * The installed Luca's version: the `@alecsibilia/luca` package this file
 * is in, or else the nearest package.json's.
 */
const lucaVersion = async (): Promise<string> => {
    let nearest: string | null = null
    for (const dir of foldersUp(import.meta.dir)) {
        const found = await packageIn(dir)
        if (found?.name === LUCA_PACKAGE && found.version !== undefined) {
            return found.version
        }
        nearest ??= found?.version ?? null
    }
    return nearest ?? '0.0.0'
}

/** The installed Luca: its version, its board folder, and its paths. */
export const lucaInstall = async () => ({
    luca_version: await lucaVersion(),
    board_dir: await boardDir(),
    engine_path: await realpath(join(import.meta.dir, 'luca-run.ts')),
    bun_path: await realpath(process.execPath),
})

/** MuninnDB's health endpoint, asked with a short timeout. */
export const muninnHealth: MuninnHealth = async () => {
    try {
        const response = await fetch(MUNINN_HEALTH_URL, {
            signal: AbortSignal.timeout(3000),
        })
        if (!response.ok) return null
        const parsed = z
            .looseObject({ version: z.string() })
            .safeParse(await response.json())
        return parsed.success ? { version: parsed.data.version } : null
    } catch {
        return null
    }
}

/** A tool's version from its `--version`, or `null` when it isn't there. */
const toolVersion = async ({
    tool,
    home,
}: {
    tool: string
    home: string
}): Promise<string | null> => {
    const bin = Bun.which(tool)
    if (bin === null) return null
    const end = await runCommand({
        cmd: [bin, '--version'],
        cwd: home,
        timeout_ms: 30_000,
    })
    return end.exit_code === 0 ? versionIn(end.stdout) : null
}

/** Every `luca` on the PATH, once per real file, in PATH order. */
const lucaCopies = async (): Promise<LucaCopy[]> => {
    const copies: LucaCopy[] = []
    const seen = new Set<string>()
    for (const dir of (process.env.PATH ?? '').split(':')) {
        if (dir === '') continue
        const path = join(dir, 'luca')
        if (!(await Bun.file(path).exists())) continue
        const real = await realpath(path).catch(() => path)
        if (seen.has(real)) continue
        seen.add(real)
        const found = await packageOf(real)
        copies.push({
            path,
            package_name: found?.name ?? null,
            version: found?.version ?? null,
        })
    }
    return copies
}

/** The computer's tools, as `luca doctor` reads them. */
export const computerOf = ({ home }: { home: string }): Computer => ({
    bunVersion: () => toolVersion({ tool: 'bun', home }),
    claudeVersion: () => toolVersion({ tool: 'claude', home }),
    ghLogin: () => ghLogin().catch(() => null),
    lucaCopies,
})

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
    try {
        const end = await runInit({
            home,
            skip_muninndb: argv.includes('--skip-muninndb'),
            skip_skills: argv.includes('--skip-skills'),
            muninn: muninnOf({ home }),
            muninn_health: muninnHealth,
            claude: claudeOf({ home }),
            launchctl: launchctlOf({ home }),
            paseo,
            skills: skillsOf({ home }),
            ask: askInTerminal,
            computer: computerOf({ home }),
            ...(await lucaInstall()),
            log: (line) => {
                console.log(line)
            },
        })
        return end.ok ? 0 : 1
    } catch (error) {
        console.error(
            `[luca init] ${error instanceof Error ? error.message : String(error)}`
        )
        return 1
    } finally {
        await paseo.close()
    }
}
