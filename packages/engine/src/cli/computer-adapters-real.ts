/**
 * The real adapters of `computer-adapters.ts`, which `luca init`, `luca
 * doctor`, and `luca upgrade` wire in: MuninnDB's CLI and health endpoint,
 * `claude mcp`, Paseo through its local daemon, the computer's tools, and
 * where the installed Luca and its board are.
 */
import { realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { DaemonClient } from '@getpaseo/client/internal/daemon-client'
import { z } from 'zod'

import {
    BOARD_PLUGIN_ID,
    MUNINN_HEALTH_URL,
    type ClaudeMcp,
    type Computer,
    type LucaCopy,
    type LucaInstall,
    type McpServer,
    type MuninnCli,
    type MuninnHealth,
    type Paseo,
} from './computer-adapters'
import { versionIn } from './doctor-checks'

import { daemonAddress } from '../board/paseo-board-link'
import { lucaVersion } from '../config/luca-version'
import { runCommand } from '../shell/run-command'
import { ghLogin } from '../tracker/github-tracker'

/** MuninnDB's official install script. */
const MUNINN_INSTALL_SCRIPT = 'https://muninndb.com/install.sh'

/** Why a command failed, from its output. Pure. */
export const failure = ({
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

/**
 * The installed Luca: its version (see `lucaVersion`), its board folder,
 * the real path of its `luca-run`, and Bun's own path.
 */
export const lucaInstall = async (): Promise<LucaInstall> => ({
    luca_version: lucaVersion(),
    board_dir: await boardDir(),
    engine_path: await realpath(join(import.meta.dir, 'luca-run.ts')),
    bun_path: await realpath(process.execPath),
})

const PackageJsonSchema = z.looseObject({
    name: z.string().optional(),
    version: z.string().optional(),
})

/** The package a file belongs to: the nearest package.json with a name. */
const packageOf = async (
    file: string
): Promise<{ name: string; version: string | null } | null> => {
    for (let dir = dirname(file); ; dir = dirname(dir)) {
        const manifest = Bun.file(join(dir, 'package.json'))
        if (await manifest.exists()) {
            const parsed = PackageJsonSchema.safeParse(
                await manifest.json().catch(() => null)
            )
            if (parsed.success && parsed.data.name !== undefined) {
                return {
                    name: parsed.data.name,
                    version: parsed.data.version ?? null,
                }
            }
        }
        if (dirname(dir) === dir) return null
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
