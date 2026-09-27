import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runInit } from './init'

import { muninnSettings } from '../memory/muninn-mcp-client'

/**
 * `luca init` end to end (seam 4): a throwaway home folder, with fakes
 * behind the adapters for MuninnDB's CLI, Claude Code's `claude mcp`,
 * `launchctl`, Paseo's plugins and their settings, the question to the
 * user, and the `skills` tool. The memory fakes write what they did to one
 * event list, in order; Paseo's and the skills tool's have their own.
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

/** The board plugin's id in Paseo. */
const BOARD_ID = 'luca-board'

/** The planning skills Luca's intake expects, from `mattpocock/skills`. */
const PLANNING_SKILLS = [
    'to-spec',
    'to-tickets',
    'setup-matt-pocock-skills',
    'grilling',
    'domain-modeling',
]

const SKILLS_SOURCE = 'mattpocock/skills'

/** The installed Luca's version, for the checks init ends with. */
const LUCA_VERSION = '14.0.0-alpha.3'

let home = ''
let muninn_bin = ''
/** Luca's install folder, as `bun add -g` leaves it. */
let luca_dir = ''
/** The board folder inside Luca's install folder. */
let board_dir = ''
/** The real path of the installed `luca-run`. */
let engine_path = ''
/** Bun's own path. */
const bun_path = realpathSync(process.execPath)
const events: string[] = []
/** What the fake Paseo was asked to do, in order. */
const paseo_events: string[] = []
/** The questions put to the user, in order. */
const questions: string[] = []
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    home = realpathSync(await mkdtemp(join(tmpdir(), 'luca-init-home-')))
    muninn_bin = join(home, '.local', 'bin', 'muninn')
    luca_dir = join(
        home,
        '.bun',
        'install',
        'global',
        'node_modules',
        '@alecsibilia',
        'luca'
    )
    board_dir = join(luca_dir, 'board')
    engine_path = join(luca_dir, 'engine', 'cli', 'luca-run.ts')
    await mkdir(board_dir, { recursive: true })
    await Bun.write(
        join(board_dir, 'paseo-plugin.json'),
        JSON.stringify({ id: BOARD_ID })
    )
    await mkdir(join(luca_dir, 'engine', 'cli'), { recursive: true })
    await Bun.write(engine_path, '#!/usr/bin/env bun\n')
    events.length = 0
    paseo_events.length = 0
    questions.length = 0
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

/** One installed Paseo plugin: its id and the folder it was installed from. */
type Plugin = { id: string; path: string }

type Settings = Record<string, unknown>

/**
 * A fake Paseo: its plugins, whether plugins are on, and each plugin's
 * settings. As in the real one, installing an id that is already there
 * fails, removing a plugin wipes its settings, a new install starts with
 * none, and nothing can be installed while plugins are off.
 */
const fakePaseo = ({
    enabled = true,
    plugins = [],
    settings = {},
}: {
    enabled?: boolean
    plugins?: Plugin[]
    settings?: Record<string, Settings>
} = {}) => {
    let is_enabled = enabled
    const store: Plugin[] = plugins.map((plugin) => ({ ...plugin }))
    const saved = new Map<string, Settings>(
        Object.entries(settings).map(([id, values]) => [id, { ...values }])
    )
    const at = (id: string) => store.findIndex((plugin) => plugin.id === id)
    const mustExist = (id: string) => {
        if (at(id) === -1) throw new Error(`No plugin ${id} is installed`)
    }
    return {
        paseo: {
            version: async () => '0.9.1',
            boardVersion: async () =>
                at(BOARD_ID) === -1 ? null : LUCA_VERSION,
            pluginsEnabled: async () => is_enabled,
            enablePlugins: async () => {
                paseo_events.push('enable plugins')
                is_enabled = true
            },
            listPlugins: async () => store.map((plugin) => ({ ...plugin })),
            installPlugin: async ({
                path,
                id,
            }: {
                path: string
                id: string
            }) => {
                paseo_events.push(`install ${id} ${path}`)
                if (!is_enabled) throw new Error('Paseo plugins are off')
                if (at(id) !== -1) {
                    throw new Error(`Plugin ${id} is already installed`)
                }
                store.push({ id, path })
                saved.set(id, {})
            },
            reloadPlugin: async ({ id }: { id: string }) => {
                paseo_events.push(`reload ${id}`)
                mustExist(id)
            },
            removePlugin: async ({ id }: { id: string }) => {
                paseo_events.push(`remove ${id}`)
                mustExist(id)
                store.splice(at(id), 1)
                saved.delete(id)
            },
            readSettings: async ({
                plugin_id,
            }: {
                plugin_id: string
            }): Promise<Settings> => {
                paseo_events.push(`read settings ${plugin_id}`)
                mustExist(plugin_id)
                return { ...(saved.get(plugin_id) ?? {}) }
            },
            writeSettings: async ({
                plugin_id,
                values,
            }: {
                plugin_id: string
                values: Settings
            }) => {
                paseo_events.push(`write settings ${plugin_id}`)
                mustExist(plugin_id)
                saved.set(plugin_id, { ...values })
            },
        },
        /** Every installed plugin now. */
        plugins: () => store.map((plugin) => ({ ...plugin })),
        /** A plugin's settings now, or `null` when it has none. */
        settings: (id: string): Settings | null => {
            const values = saved.get(id)
            return values === undefined ? null : { ...values }
        },
        enabled: () => is_enabled,
    }
}

/** The user's answer to every question, recorded in `questions`. */
const answer =
    (yes: boolean) =>
    async ({ question }: { question: string }) => {
        questions.push(question)
        return yes
    }

/** A fake `skills` tool: the skills installed, and each install asked for. */
const fakeSkills = ({ installed = [] }: { installed?: string[] } = {}) => {
    const have = new Set(installed)
    const asked: { source: string; skills: string[] }[] = []
    let looks = 0
    return {
        skills: {
            installedSkills: async () => {
                looks += 1
                return [...have]
            },
            installSkills: async ({
                source,
                skills,
            }: {
                source: string
                skills: string[]
            }) => {
                asked.push({ source, skills: [...skills] })
                for (const skill of skills) have.add(skill)
            },
        },
        /** Every skill name passed to an install, in order. */
        requested: () => asked.flatMap(({ skills }) => skills),
        /** Every source passed to an install. */
        sources: () => asked.map(({ source }) => source),
        /** The skills installed now, sorted. */
        installed: () => [...have].sort(),
        /** How many times the installed skills were looked up. */
        looks: () => looks,
    }
}

type Fakes = {
    muninn: ReturnType<typeof fakeMuninn>
    claude: ReturnType<typeof fakeClaude>
    launchctl: ReturnType<typeof fakeLaunchctl>
    paseo?: ReturnType<typeof fakePaseo>
    skills?: ReturnType<typeof fakeSkills>
}

const freshFakes = (): Fakes => ({
    muninn: fakeMuninn(),
    claude: fakeClaude(),
    launchctl: fakeLaunchctl(),
    paseo: fakePaseo(),
    skills: fakeSkills(),
})

const init = ({
    fakes,
    skip_muninndb = false,
    skip_skills = false,
    yes = false,
}: {
    fakes: Fakes
    skip_muninndb?: boolean
    skip_skills?: boolean
    /** The user's answer when asked. */
    yes?: boolean
}) =>
    runInit({
        home,
        skip_muninndb,
        skip_skills,
        muninn: fakes.muninn,
        muninn_health: async () => ({ version: '0.11.0' }),
        claude: fakes.claude.claude,
        launchctl: fakes.launchctl.launchctl,
        paseo: (fakes.paseo ?? fakePaseo()).paseo,
        skills: (fakes.skills ?? fakeSkills()).skills,
        ask: answer(yes),
        computer: {
            bunVersion: async () => '1.3.11',
            claudeVersion: async () => '2.1.280',
            ghLogin: async () => 'asibilia',
            lucaCopies: async () => [
                {
                    path: join(home, '.bun', 'bin', 'luca'),
                    package_name: '@alecsibilia/luca',
                    version: LUCA_VERSION,
                },
            ],
        },
        luca_version: LUCA_VERSION,
        board_dir,
        engine_path,
        bun_path,
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

/** What the fake Paseo was asked to change, leaving out reads. */
const paseoChanges = (): string[] =>
    paseo_events.filter((event) => !event.startsWith('read '))

/** The settings a user tuned on the old board: its usage lines too. */
const TUNED_LINES = { weekly_line: 55, five_hour_line: 65 }

describe('luca init puts the board into Paseo on a fresh computer', () => {
    test('the board is installed once as a folder source with id luca-board, from the board folder in the Luca install folder', async () => {
        const fakes = freshFakes()
        const paseo = fakePaseo()

        await init({ fakes: { ...fakes, paseo } })

        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
        expect(
            paseo_events.filter((event) => event.startsWith('install '))
        ).toEqual([`install ${BOARD_ID} ${board_dir}`])
        expect(paseo_events).not.toContain(`remove ${BOARD_ID}`)
    })

    test('the board engine path is the installed luca-run and its Bun path is the path of Bun itself', async () => {
        const fakes = freshFakes()
        const paseo = fakePaseo()

        await init({ fakes: { ...fakes, paseo } })

        expect(paseo.settings(BOARD_ID)).toMatchObject({
            engine_path,
            bun_path,
        })
        expect(
            paseo_events.indexOf(`install ${BOARD_ID} ${board_dir}`)
        ).toBeLessThan(paseo_events.lastIndexOf(`write settings ${BOARD_ID}`))
    })

    test('the board is installed even when MuninnDB is skipped', async () => {
        const fakes = freshFakes()
        const paseo = fakePaseo()

        await init({ fakes: { ...fakes, paseo }, skip_muninndb: true })

        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
        expect(paseo.settings(BOARD_ID)).toMatchObject({
            engine_path,
            bun_path,
        })
    })

    test('init says /reload-skills is needed after installing the board', async () => {
        await init({ fakes: freshFakes() })

        expect(printed()).toContain('/reload-skills')
    })

    test('with plugins on, the user is not asked anything', async () => {
        const paseo = fakePaseo()

        await init({ fakes: { ...freshFakes(), paseo } })

        expect(questions).toEqual([])
        expect(paseo_events).not.toContain('enable plugins')
        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
    })
})

describe('luca init with the board already installed from the same folder', () => {
    test('the board is reloaded, not removed or installed again, and its settings are kept', async () => {
        const kept = { engine_path, bun_path, ...TUNED_LINES }
        const paseo = fakePaseo({
            plugins: [{ id: BOARD_ID, path: board_dir }],
            settings: { [BOARD_ID]: kept },
        })

        await init({ fakes: { ...freshFakes(), paseo } })

        expect(paseo_events).toContain(`reload ${BOARD_ID}`)
        expect(paseo_events).not.toContain(`remove ${BOARD_ID}`)
        expect(
            paseo_events.filter((event) => event.startsWith('install '))
        ).toEqual([])
        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
        expect(paseo.settings(BOARD_ID)).toEqual(kept)
    })

    test('a stale engine or Bun path is corrected and the usage lines are kept', async () => {
        const paseo = fakePaseo({
            plugins: [{ id: BOARD_ID, path: board_dir }],
            settings: {
                [BOARD_ID]: {
                    engine_path: '/old/luca-run.ts',
                    bun_path: '/old/bun',
                    ...TUNED_LINES,
                },
            },
        })

        await init({ fakes: { ...freshFakes(), paseo } })

        expect(paseo_events).toContain(`reload ${BOARD_ID}`)
        expect(paseo_events).not.toContain(`remove ${BOARD_ID}`)
        expect(paseo.settings(BOARD_ID)).toEqual({
            engine_path,
            bun_path,
            ...TUNED_LINES,
        })
    })
})

describe('luca init with the board installed from another folder', () => {
    test('the settings, usage lines included, are read, the source is switched to the Luca install folder, and the settings are written back', async () => {
        const old_board = join(
            home,
            '.local',
            'share',
            'luca',
            'packages',
            'board'
        )
        const paseo = fakePaseo({
            plugins: [{ id: BOARD_ID, path: old_board }],
            settings: {
                [BOARD_ID]: {
                    engine_path: join(
                        home,
                        '.local',
                        'share',
                        'luca',
                        'packages',
                        'engine',
                        'src',
                        'cli',
                        'luca-run.ts'
                    ),
                    bun_path: '/old/bun',
                    ...TUNED_LINES,
                },
            },
        })

        await init({ fakes: { ...freshFakes(), paseo } })

        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
        expect(paseo.settings(BOARD_ID)).toEqual({
            engine_path,
            bun_path,
            ...TUNED_LINES,
        })
    })

    test('the settings are read before the old board is removed, and written back after the new one is installed', async () => {
        const old_board = join(home, 'old-clone', 'packages', 'board')
        const paseo = fakePaseo({
            plugins: [{ id: BOARD_ID, path: old_board }],
            settings: {
                [BOARD_ID]: {
                    engine_path: '/old/luca-run.ts',
                    bun_path: '/old/bun',
                    ...TUNED_LINES,
                },
            },
        })

        await init({ fakes: { ...freshFakes(), paseo } })

        const read = paseo_events.indexOf(`read settings ${BOARD_ID}`)
        const removed = paseo_events.indexOf(`remove ${BOARD_ID}`)
        const installed = paseo_events.indexOf(
            `install ${BOARD_ID} ${board_dir}`
        )
        const written = paseo_events.lastIndexOf(`write settings ${BOARD_ID}`)
        expect(read).not.toBe(-1)
        expect(read).toBeLessThan(removed)
        expect(removed).toBeLessThan(installed)
        expect(installed).toBeLessThan(written)
        expect(
            paseo_events.filter((event) => event.startsWith('remove '))
        ).toEqual([`remove ${BOARD_ID}`])
    })

    test('another plugin in Paseo is left alone', async () => {
        const other: Plugin = { id: 'someone-else', path: join(home, 'other') }
        const paseo = fakePaseo({
            plugins: [
                other,
                { id: BOARD_ID, path: join(home, 'old-clone', 'board') },
            ],
            settings: { 'someone-else': { theme: 'dark' } },
        })

        await init({ fakes: { ...freshFakes(), paseo } })

        expect(paseo.plugins()).toContainEqual(other)
        expect(paseo.plugins()).toContainEqual({
            id: BOARD_ID,
            path: board_dir,
        })
        expect(paseo.settings('someone-else')).toEqual({ theme: 'dark' })
        expect(paseo_events).not.toContain('remove someone-else')
    })
})

describe('luca init with Paseo plugins off', () => {
    test('the user is asked before plugins are turned on', async () => {
        const paseo = fakePaseo({ enabled: false })

        await init({ fakes: { ...freshFakes(), paseo }, yes: false })

        expect(questions).toHaveLength(1)
        expect(questions[0]).toMatch(/plugins/i)
    })

    test('on no, it is reported and nothing in Paseo changes', async () => {
        const paseo = fakePaseo({ enabled: false })

        await init({ fakes: { ...freshFakes(), paseo }, yes: false })

        expect(paseoChanges()).toEqual([])
        expect(paseo.enabled()).toBe(false)
        expect(paseo.plugins()).toEqual([])
        expect(paseo.settings(BOARD_ID)).toBeNull()
        expect(printed()).toMatch(/plugins/i)
    })

    test('on yes, plugins are turned on, then the board is installed with its paths', async () => {
        const paseo = fakePaseo({ enabled: false })

        await init({ fakes: { ...freshFakes(), paseo }, yes: true })

        expect(questions).toHaveLength(1)
        expect(paseo.enabled()).toBe(true)
        expect(paseo_events.indexOf('enable plugins')).toBeLessThan(
            paseo_events.indexOf(`install ${BOARD_ID} ${board_dir}`)
        )
        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
        expect(paseo.settings(BOARD_ID)).toMatchObject({
            engine_path,
            bun_path,
        })
    })
})

describe('luca init installs the planning skills', () => {
    test('on a computer with none, all five are installed from mattpocock/skills', async () => {
        const skills = fakeSkills()

        await init({ fakes: { ...freshFakes(), skills } })

        expect([...skills.requested()].sort()).toEqual(
            [...PLANNING_SKILLS].sort()
        )
        expect(skills.sources().length).toBeGreaterThan(0)
        for (const source of skills.sources()) {
            expect(source).toBe(SKILLS_SOURCE)
        }
        expect(skills.installed()).toEqual([...PLANNING_SKILLS].sort())
    })

    test('only the missing planning skills are installed, and other skills of the user are left alone', async () => {
        const skills = fakeSkills({
            installed: ['to-spec', 'grilling', 'my-own-skill'],
        })

        await init({ fakes: { ...freshFakes(), skills } })

        expect([...skills.requested()].sort()).toEqual(
            ['domain-modeling', 'setup-matt-pocock-skills', 'to-tickets'].sort()
        )
        expect(skills.installed()).toEqual(
            [...PLANNING_SKILLS, 'my-own-skill'].sort()
        )
    })

    test('with every planning skill already there, they are looked up and nothing is installed', async () => {
        const skills = fakeSkills({ installed: [...PLANNING_SKILLS] })

        await init({ fakes: { ...freshFakes(), skills } })

        expect(skills.looks()).toBeGreaterThan(0)
        expect(skills.requested()).toEqual([])
        expect(skills.installed()).toEqual([...PLANNING_SKILLS].sort())
    })

    test('--skip-skills installs no skills and says they were skipped', async () => {
        const skills = fakeSkills()

        await init({ fakes: { ...freshFakes(), skills }, skip_skills: true })

        expect(skills.requested()).toEqual([])
        expect(skills.installed()).toEqual([])
        expect(printed()).toContain('--skip-skills')
    })

    test('--skip-skills still puts the board into Paseo', async () => {
        const paseo = fakePaseo()

        await init({ fakes: { ...freshFakes(), paseo }, skip_skills: true })

        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
    })
})
