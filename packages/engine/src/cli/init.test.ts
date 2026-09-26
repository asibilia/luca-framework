import { realpathSync } from 'node:fs'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runInit } from './init'

import { muninnSettings } from '../memory/muninn-mcp-client'

/**
 * `luca init`'s memory part end to end (seam 4): a throwaway home folder,
 * with fakes behind the adapters for MuninnDB's CLI, Claude Code's
 * `claude mcp`, and `launchctl`. Every fake writes what it did to one
 * event list, in order.
 */

/** MuninnDB's own token: the `mdb_` one that reaches every vault. */
const TOKEN = 'mdb_test_secret_9f8e7d6c5b4a3210'

/** Where MuninnDB serves MCP. */
const MUNINN_MCP_URL = 'http://127.0.0.1:8750/mcp'

type McpServer = {
    name: string
    scope: 'user' | 'local' | 'project'
    transport: 'http' | 'sse' | 'stdio'
    url: string
    headers: Record<string, string>
}

/** The entry `luca init` must leave in Claude Code. */
const RIGHT_ENTRY: McpServer = {
    name: 'muninn',
    scope: 'user',
    transport: 'http',
    url: MUNINN_MCP_URL,
    headers: { Authorization: `Bearer ${TOKEN}` },
}

let home = ''
let muninn_bin = ''
const events: string[] = []
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    home = realpathSync(await mkdtemp(join(tmpdir(), 'luca-init-home-')))
    muninn_bin = join(home, '.local', 'bin', 'muninn')
    events.length = 0
    logs.length = 0
})

afterEach(async () => {
    await rm(home, { recursive: true, force: true })
})

/**
 * A fake MuninnDB CLI. `which` gives the binary's path once installed;
 * the token file exists once `muninn init` has run.
 */
const fakeMuninn = ({
    installed = false,
    initialized = false,
}: { installed?: boolean; initialized?: boolean } = {}) => {
    let is_installed = installed
    let is_initialized = initialized
    return {
        which: async () => (is_installed ? muninn_bin : null),
        install: async () => {
            events.push('muninn install')
            is_installed = true
        },
        run: async ({ args }: { args: string[] }) => {
            events.push(`muninn ${args.join(' ')}`)
            if (!is_installed) throw new Error('muninn: command not found')
            if (args[0] === 'init') is_initialized = true
            return { exit_code: 0, stdout: '', stderr: '' }
        },
        token: async () => (is_initialized ? TOKEN : null),
    }
}

const copy = (server: McpServer): McpServer => ({
    ...server,
    headers: { ...server.headers },
})

/**
 * A fake `claude mcp`: adding a name that exists in that scope fails, as
 * the real one does; removing one that isn't there fails too.
 */
const fakeClaude = ({
    servers = [],
    fail_add_with = null,
}: { servers?: McpServer[]; fail_add_with?: string | null } = {}) => {
    const store = servers.map(copy)
    const at = ({ name, scope }: { name: string; scope: string }) =>
        store.findIndex(
            (server) => server.name === name && server.scope === scope
        )
    return {
        claude: {
            listMcpServers: async () => store.map(copy),
            addMcpServer: async (server: McpServer) => {
                events.push(`claude mcp add ${server.scope} ${server.name}`)
                if (fail_add_with !== null) throw new Error(fail_add_with)
                if (at(server) !== -1) {
                    throw new Error(
                        `MCP server ${server.name} already exists in ${server.scope} config`
                    )
                }
                store.push(copy(server))
            },
            removeMcpServer: async ({
                name,
                scope,
            }: {
                name: string
                scope: McpServer['scope']
            }) => {
                events.push(`claude mcp remove ${scope} ${name}`)
                const index = at({ name, scope })
                if (index === -1) {
                    throw new Error(`No MCP server named ${name} in ${scope}`)
                }
                store.splice(index, 1)
            },
        },
        /** Every entry now, as stored. */
        servers: () => store.map(copy),
    }
}

/** A fake `launchctl`: loading reads the plist's Label, as launchd does. */
const fakeLaunchctl = () => {
    const loaded = new Map<string, string>()
    return {
        launchctl: {
            loaded: async ({ label }: { label: string }) => loaded.has(label),
            load: async ({ plist }: { plist: string }) => {
                events.push(`launchctl load ${plist}`)
                const text = await Bun.file(plist).text()
                const label =
                    /<key>Label<\/key>\s*<string>([^<]+)<\/string>/.exec(
                        text
                    )?.[1]
                if (label === undefined) {
                    throw new Error(`${plist} has no Label`)
                }
                if (loaded.has(label)) {
                    throw new Error(`Load failed: service already loaded`)
                }
                loaded.set(label, plist)
            },
        },
        /** The plist files loaded, oldest first. */
        plists: () => [...loaded.values()],
    }
}

type Fakes = {
    muninn: ReturnType<typeof fakeMuninn>
    claude: ReturnType<typeof fakeClaude>
    launchctl: ReturnType<typeof fakeLaunchctl>
}

const freshFakes = (): Fakes => ({
    muninn: fakeMuninn(),
    claude: fakeClaude(),
    launchctl: fakeLaunchctl(),
})

const init = ({
    fakes,
    skip_muninndb = false,
}: {
    fakes: Fakes
    skip_muninndb?: boolean
}) =>
    runInit({
        home,
        skip_muninndb,
        muninn: fakes.muninn,
        claude: fakes.claude.claude,
        launchctl: fakes.launchctl.launchctl,
        log,
    })

const LAUNCH_AGENTS = () => join(home, 'Library', 'LaunchAgents')

/** The plist files in the throwaway home's LaunchAgents folder. */
const loginItems = async (): Promise<string[]> => {
    const names = await readdir(LAUNCH_AGENTS()).catch(() => [])
    return names
        .filter((name) => name.endsWith('.plist'))
        .map((name) => join(LAUNCH_AGENTS(), name))
}

/** The engine's view of the user-scope `muninn` entry, as ~/.claude.json holds it. */
const engineSettingsOf = (servers: McpServer[]) => {
    const user = servers.find(
        ({ name, scope }) => name === 'muninn' && scope === 'user'
    )
    return muninnSettings({
        env: {},
        claude_json: JSON.stringify({
            mcpServers:
                user === undefined
                    ? {}
                    : {
                          muninn: {
                              type: user.transport,
                              url: user.url,
                              headers: user.headers,
                          },
                      },
        }),
    })
}

const printed = (): string => logs.join('\n')

describe('luca init sets up MuninnDB on a fresh computer', () => {
    test('MuninnDB is installed, then initialized with muninn init --yes', async () => {
        const fakes = freshFakes()

        await init({ fakes })

        expect(events).toContain('muninn install')
        expect(events).toContain('muninn init --yes')
        expect(events.indexOf('muninn install')).toBeLessThan(
            events.indexOf('muninn init --yes')
        )
        for (const event of events.filter((e) => e.startsWith('muninn '))) {
            expect(event).not.toContain('--tool')
            expect(event).not.toContain('claude-code')
        }
    })

    test('a user-scope muninn entry is added over HTTP with the literal token', async () => {
        const fakes = freshFakes()

        await init({ fakes })

        const servers = fakes.claude.servers()
        expect(servers).toEqual([RIGHT_ENTRY])
        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([
            'claude mcp add user muninn',
        ])
        const settings = engineSettingsOf(servers)
        if (!settings.ok) throw new Error(settings.error)
        expect(settings.settings).toEqual({
            url: MUNINN_MCP_URL,
            authorization: `Bearer ${TOKEN}`,
        })
    })

    test('a login item that runs muninn start once at login is written and loaded', async () => {
        const fakes = freshFakes()

        await init({ fakes })

        const items = await loginItems()
        expect(items).toHaveLength(1)
        const [plist] = items
        if (plist === undefined) throw new Error('No login item')
        const text = await Bun.file(plist).text()
        expect(text).toContain(`<string>${muninn_bin}</string>`)
        expect(text).toContain('<string>start</string>')
        expect(text).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/)
        expect(text).not.toContain('KeepAlive')
        expect(text).not.toContain(TOKEN)
        expect(fakes.launchctl.plists()).toEqual([plist])
        expect(events).toContain(`launchctl load ${plist}`)
    })

    test('MuninnDB already installed is not installed again', async () => {
        const fakes = {
            ...freshFakes(),
            muninn: fakeMuninn({ installed: true }),
        }

        await init({ fakes })

        expect(events).not.toContain('muninn install')
        expect(events).toContain('muninn init --yes')
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
    })
})

describe('luca init is safe to run again', () => {
    test('a second run with everything right changes nothing', async () => {
        const fakes = freshFakes()
        await init({ fakes })
        const servers_after_first = fakes.claude.servers()
        const items_after_first = await loginItems()
        const plist_texts = await Promise.all(
            items_after_first.map((item) => Bun.file(item).text())
        )
        events.length = 0
        logs.length = 0

        await init({ fakes })

        expect(events).not.toContain('muninn install')
        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([])
        expect(events.filter((e) => e.startsWith('launchctl '))).toEqual([])
        expect(fakes.claude.servers()).toEqual(servers_after_first)
        expect(await loginItems()).toEqual(items_after_first)
        expect(
            await Promise.all(
                items_after_first.map((item) => Bun.file(item).text())
            )
        ).toEqual(plist_texts)
        expect(fakes.launchctl.plists()).toEqual(items_after_first)
    })

    test('a right muninn entry already there is left alone', async () => {
        const fakes = {
            muninn: fakeMuninn({ installed: true, initialized: true }),
            claude: fakeClaude({ servers: [RIGHT_ENTRY] }),
            launchctl: fakeLaunchctl(),
        }

        await init({ fakes })

        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([])
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
    })
})

describe('luca init fixes a wrong muninn entry', () => {
    test('an entry with an old token is removed, then added with the right one', async () => {
        const fakes = {
            muninn: fakeMuninn({ installed: true, initialized: true }),
            claude: fakeClaude({
                servers: [
                    {
                        ...RIGHT_ENTRY,
                        headers: { Authorization: 'Bearer mdb_old_token' },
                    },
                ],
            }),
            launchctl: fakeLaunchctl(),
        }

        await init({ fakes })

        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([
            'claude mcp remove user muninn',
            'claude mcp add user muninn',
        ])
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
    })

    test('an entry whose header holds a variable, not the literal token, is replaced', async () => {
        const fakes = {
            muninn: fakeMuninn({ installed: true, initialized: true }),
            claude: fakeClaude({
                servers: [
                    {
                        ...RIGHT_ENTRY,
                        headers: {
                            Authorization: 'Bearer ${MUNINN_TOKEN}',
                        },
                    },
                ],
            }),
            launchctl: fakeLaunchctl(),
        }

        await init({ fakes })

        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([
            'claude mcp remove user muninn',
            'claude mcp add user muninn',
        ])
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
    })

    test('an entry over SSE is removed, then added over HTTP', async () => {
        const fakes = {
            muninn: fakeMuninn({ installed: true, initialized: true }),
            claude: fakeClaude({
                servers: [
                    {
                        ...RIGHT_ENTRY,
                        transport: 'sse',
                        url: 'http://127.0.0.1:8750/sse',
                    },
                ],
            }),
            launchctl: fakeLaunchctl(),
        }

        await init({ fakes })

        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([
            'claude mcp remove user muninn',
            'claude mcp add user muninn',
        ])
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
    })

    test('a local-scope muninn entry is left alone and a user-scope one is added', async () => {
        const local: McpServer = {
            ...RIGHT_ENTRY,
            scope: 'local',
            headers: { Authorization: 'Bearer mdb_local_token' },
        }
        const fakes = {
            muninn: fakeMuninn({ installed: true, initialized: true }),
            claude: fakeClaude({ servers: [local] }),
            launchctl: fakeLaunchctl(),
        }

        await init({ fakes })

        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([
            'claude mcp add user muninn',
        ])
        expect(fakes.claude.servers()).toContainEqual(local)
        expect(fakes.claude.servers()).toContainEqual(RIGHT_ENTRY)
    })
})

describe('luca init --skip-muninndb', () => {
    test('makes no MuninnDB, Claude Code, or login-item changes and says memory is off', async () => {
        const fakes = freshFakes()

        await init({ fakes, skip_muninndb: true })

        expect(events).toEqual([])
        expect(fakes.claude.servers()).toEqual([])
        expect(await loginItems()).toEqual([])
        expect(fakes.launchctl.plists()).toEqual([])
        expect(printed()).toMatch(/memory off/i)
    })
})

describe('luca init never shows the token', () => {
    test('the token is not in anything init prints or returns', async () => {
        const fakes = {
            muninn: fakeMuninn({ installed: true, initialized: true }),
            claude: fakeClaude({
                servers: [
                    {
                        ...RIGHT_ENTRY,
                        headers: { Authorization: 'Bearer mdb_old_token' },
                    },
                ],
            }),
            launchctl: fakeLaunchctl(),
        }

        const end = await init({ fakes })

        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
        expect(logs.length).toBeGreaterThan(0)
        expect(printed()).not.toContain(TOKEN)
        expect(JSON.stringify(end) ?? '').not.toContain(TOKEN)
    })

    test('a failing claude mcp add whose error names the token does not leak it', async () => {
        const fakes = {
            muninn: fakeMuninn({ installed: true, initialized: true }),
            claude: fakeClaude({
                fail_add_with: `claude mcp add failed: --header "Authorization: Bearer ${TOKEN}"`,
            }),
            launchctl: fakeLaunchctl(),
        }

        let thrown = ''
        let end: unknown = null
        try {
            end = await init({ fakes })
        } catch (error) {
            thrown =
                error instanceof Error
                    ? `${error.message}\n${error.stack ?? ''}`
                    : String(error)
        }

        expect(events).toContain('claude mcp add user muninn')
        expect(printed()).not.toContain(TOKEN)
        expect(thrown).not.toContain(TOKEN)
        expect(JSON.stringify(end) ?? '').not.toContain(TOKEN)
    })
})
