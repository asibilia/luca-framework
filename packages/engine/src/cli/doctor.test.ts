import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { $ } from 'bun'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runDoctor } from './doctor'
import { runInit } from './init'
import { runSetup } from './setup'

import { loadV13Manifest, type V13Manifest } from '../doctor/v13-manifest'
import { createFakeMuninn, type FakeMuninn } from '../testing/fake-muninn'
import { git } from '../testing/practice-repo'

/**
 * `luca doctor [--fix]` end to end (seam 4): a throwaway home folder and
 * throwaway repos, with fakes behind the adapters for the computer's tools
 * (Bun, Claude Code, `gh`, the `luca` copies on the PATH), MuninnDB's CLI and
 * health endpoint, `claude mcp`, Paseo (its version, its plugins, the
 * board's settings, and the board's loaded version), and GitHub.
 *
 * Each check is found by its group and name:
 * - computer: `bun`, `luca`, `claude_code`, `gh_login`, `paseo`,
 *   `paseo_plugins`, `board`, `muninndb`, `muninn_entry`, `planning_skills`;
 * - repo: `labels`, `config`, `github_remote`, `issue_links`,
 *   `base_branch`, `vault`;
 * - v13: what old Luca v13 left behind, found by the group alone.
 *
 * A check's `status` is `ok`, `warning`, or `problem`; a warning or problem
 * carries the exact `fix`. Its line prints OK, or the problem and the fix.
 */

/** The installed Luca's version. */
const LUCA_VERSION = '14.0.0-alpha.3'

/** MuninnDB's own token: the `mdb_` one that reaches every vault. */
const TOKEN = 'mdb_test_secret_9f8e7d6c5b4a3210'

const MUNINN_MCP_URL = 'http://127.0.0.1:8750/mcp'

type McpServer = {
    name: string
    scope: 'user' | 'local' | 'project'
    transport: 'http' | 'sse' | 'stdio'
    url: string
    headers: Record<string, string>
}

/** The entry `luca init` leaves in Claude Code. */
const RIGHT_ENTRY: McpServer = {
    name: 'muninn',
    scope: 'user',
    transport: 'http',
    url: MUNINN_MCP_URL,
    headers: { Authorization: `Bearer ${TOKEN}` },
}

const BOARD_ID = 'luca-board'

/** The settings a user tuned on the board: its usage lines. */
const TUNED_LINES = { weekly_line: 55, five_hour_line: 65 }

const COMPUTER_CHECKS = [
    'bun',
    'luca',
    'claude_code',
    'gh_login',
    'paseo',
    'paseo_plugins',
    'board',
    'muninndb',
    'muninn_entry',
    'planning_skills',
]

const REPO_CHECKS = [
    'labels',
    'config',
    'github_remote',
    'issue_links',
    'base_branch',
    'vault',
]

/** A `to-spec` skill that writes what intake needs. */
const TO_SPEC = `---
name: to-spec
description: Turn the conversation into a spec issue.
---

# To spec

Write the spec with these sections:

## Problem Statement
## Solution
## User Stories
## Implementation Decisions
## Testing Decisions
## Out of Scope

Publish it as a GitHub issue labeled \`ready-for-agent\`.
`

/** A `to-tickets` skill that writes what intake needs. */
const TO_TICKETS = `---
name: to-tickets
description: Break a spec into tickets.
---

# To tickets

Each ticket has these sections:

## Parent
## What to build
## Acceptance criteria
## Blocked by

Label every ticket \`ready-for-agent\`.
`

let home = ''
/** Holds the throwaway repo and its bare origin. */
let root = ''
let repo = ''
let origin = ''
let luca_dir = ''
let board_dir = ''
let engine_path = ''
/** Stands in for `/tmp`, where v13 left its `luca-*.json` payloads. */
let tmp_dir = ''
const bun_path = realpathSync(process.execPath)
/** What the MuninnDB and Claude Code fakes were asked to do, in order. */
const events: string[] = []
/** What the fake Paseo was asked to do, in order. */
const paseo_events: string[] = []
const logs: string[] = []
const log = (line: string) => {
    logs.push(line)
}

beforeEach(async () => {
    home = realpathSync(await mkdtemp(join(tmpdir(), 'luca-doctor-home-')))
    root = realpathSync(await mkdtemp(join(tmpdir(), 'luca-doctor-repo-')))
    repo = join(root, 'repo')
    origin = join(root, 'origin.git')
    luca_dir = join(
        home,
        '.bun',
        'install',
        'global',
        'node_modules',
        '@alecsibilia',
        'luca'
    )
    tmp_dir = join(root, 'tmp')
    await mkdir(tmp_dir)
    board_dir = join(luca_dir, 'board')
    engine_path = join(luca_dir, 'engine', 'cli', 'luca-run.ts')
    await mkdir(board_dir, { recursive: true })
    await Bun.write(
        join(board_dir, 'paseo-plugin.json'),
        JSON.stringify({ id: BOARD_ID })
    )
    await mkdir(join(luca_dir, 'engine', 'cli'), { recursive: true })
    await Bun.write(engine_path, '#!/usr/bin/env bun\n')
    await writeSkills({})
    events.length = 0
    paseo_events.length = 0
    logs.length = 0
})

afterEach(async () => {
    await rm(home, { recursive: true, force: true })
    await rm(root, { recursive: true, force: true })
})

/** Writes the installed `to-spec` and `to-tickets` into the home folder. */
const writeSkills = async ({
    to_spec = TO_SPEC,
    to_tickets = TO_TICKETS,
}: {
    to_spec?: string
    to_tickets?: string
}) => {
    for (const [name, text] of [
        ['to-spec', to_spec],
        ['to-tickets', to_tickets],
    ] as const) {
        await mkdir(join(home, '.claude', 'skills', name), { recursive: true })
        await Bun.write(join(home, '.claude', 'skills', name, 'SKILL.md'), text)
    }
}

/** One `luca` found on the PATH, and the package it belongs to. */
type LucaCopy = { path: string; package_name: string; version: string }

/** The v14 `luca` that `bun add -g` put on the PATH. */
const v14Copy = (): LucaCopy => ({
    path: join(home, '.bun', 'bin', 'luca'),
    package_name: '@alecsibilia/luca',
    version: LUCA_VERSION,
})

/** The computer's tools, as they are. They have nothing to change. */
const fakeComputer = ({
    bun = '1.3.11',
    claude = '2.1.280',
    gh = 'asibilia',
    copies,
}: {
    bun?: string | null
    claude?: string | null
    gh?: string | null
    copies?: LucaCopy[]
} = {}) => ({
    bunVersion: async () => bun,
    claudeVersion: async () => claude,
    ghLogin: async () => gh,
    lucaCopies: async () =>
        (copies ?? [v14Copy()]).map((copy) => ({ ...copy })),
})

/**
 * A fake MuninnDB: its CLI (`muninn start` starts it) and its health
 * endpoint, which answers with its version only while it runs.
 */
const fakeMuninn = ({
    installed = true,
    initialized = true,
    running = true,
    version = '0.11.0',
}: {
    installed?: boolean
    initialized?: boolean
    running?: boolean
    version?: string
} = {}) => {
    let is_installed = installed
    let is_initialized = initialized
    let is_running = running
    return {
        muninn: {
            which: async () =>
                is_installed ? join(home, '.local', 'bin', 'muninn') : null,
            install: async () => {
                events.push('muninn install')
                is_installed = true
            },
            run: async ({ args }: { args: string[] }) => {
                events.push(`muninn ${args.join(' ')}`)
                if (!is_installed) throw new Error('muninn: command not found')
                if (args[0] === 'init') is_initialized = true
                if (args[0] === 'start') is_running = true
                return { exit_code: 0, stdout: '', stderr: '' }
            },
            token: async () => (is_initialized ? TOKEN : null),
        },
        health: async (): Promise<{ version: string } | null> =>
            is_installed && is_running ? { version } : null,
        running: () => is_running,
    }
}

const copyServer = (server: McpServer): McpServer => ({
    ...server,
    headers: { ...server.headers },
})

/** A fake `claude mcp`, strict like the real one. */
const fakeClaude = ({ servers = [] }: { servers?: McpServer[] } = {}) => {
    const store = servers.map(copyServer)
    const at = ({ name, scope }: { name: string; scope: string }) =>
        store.findIndex(
            (server) => server.name === name && server.scope === scope
        )
    return {
        claude: {
            listMcpServers: async () => store.map(copyServer),
            addMcpServer: async (server: McpServer) => {
                events.push(`claude mcp add ${server.scope} ${server.name}`)
                if (at(server) !== -1) {
                    throw new Error(
                        `MCP server ${server.name} already exists in ${server.scope} config`
                    )
                }
                store.push(copyServer(server))
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
        servers: () => store.map(copyServer),
    }
}

type Plugin = { id: string; path: string }
type Settings = Record<string, unknown>

/**
 * A fake Paseo: its version, whether plugins are on, its plugins and their
 * settings, and the Luca version the loaded board reports. Installing or
 * reloading the board from the Luca install folder loads that folder's
 * version, the installed Luca's. When Paseo isn't running, every call fails.
 */
const fakePaseo = ({
    running = true,
    version = '0.9.1',
    enabled = true,
    plugins,
    settings,
    board_version = LUCA_VERSION,
}: {
    running?: boolean
    version?: string
    enabled?: boolean
    plugins?: Plugin[]
    settings?: Record<string, Settings>
    board_version?: string
} = {}) => {
    let is_enabled = enabled
    let loaded_version = board_version
    const store: Plugin[] = (
        plugins ?? [{ id: BOARD_ID, path: board_dir }]
    ).map((plugin) => ({ ...plugin }))
    const saved = new Map<string, Settings>(
        Object.entries(
            settings ?? {
                [BOARD_ID]: { engine_path, bun_path, ...TUNED_LINES },
            }
        ).map(([id, values]) => [id, { ...values }])
    )
    const up = () => {
        if (!running) {
            throw new Error('connect ECONNREFUSED 127.0.0.1:6767')
        }
    }
    const at = (id: string) => store.findIndex((plugin) => plugin.id === id)
    const mustExist = (id: string) => {
        if (at(id) === -1) throw new Error(`No plugin ${id} is installed`)
    }
    const load = (path: string) => {
        if (path === board_dir) loaded_version = LUCA_VERSION
    }
    return {
        paseo: {
            version: async () => {
                up()
                return version
            },
            pluginsEnabled: async () => {
                up()
                return is_enabled
            },
            enablePlugins: async () => {
                up()
                paseo_events.push('enable plugins')
                is_enabled = true
            },
            listPlugins: async () => {
                up()
                return store.map((plugin) => ({ ...plugin }))
            },
            installPlugin: async ({
                path,
                id,
            }: {
                path: string
                id: string
            }) => {
                up()
                paseo_events.push(`install ${id} ${path}`)
                if (!is_enabled) throw new Error('Paseo plugins are off')
                if (at(id) !== -1) {
                    throw new Error(`Plugin ${id} is already installed`)
                }
                store.push({ id, path })
                saved.set(id, {})
                if (id === BOARD_ID) load(path)
            },
            reloadPlugin: async ({ id }: { id: string }) => {
                up()
                paseo_events.push(`reload ${id}`)
                mustExist(id)
                const plugin = store[at(id)]
                if (id === BOARD_ID && plugin !== undefined) load(plugin.path)
            },
            removePlugin: async ({ id }: { id: string }) => {
                up()
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
                up()
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
                up()
                paseo_events.push(`write settings ${plugin_id}`)
                mustExist(plugin_id)
                saved.set(plugin_id, { ...values })
            },
            /** The Luca version the loaded board reports; `null` with no board. */
            boardVersion: async (): Promise<string | null> => {
                up()
                return at(BOARD_ID) === -1 ? null : loaded_version
            },
        },
        plugins: () => store.map((plugin) => ({ ...plugin })),
        settings: (id: string): Settings | null => {
            const values = saved.get(id)
            return values === undefined ? null : { ...values }
        },
        enabled: () => is_enabled,
    }
}

type Fakes = {
    computer: ReturnType<typeof fakeComputer>
    muninn: ReturnType<typeof fakeMuninn>
    claude: ReturnType<typeof fakeClaude>
    paseo: ReturnType<typeof fakePaseo>
}

/** Fakes for a computer where everything is right. */
const healthy = (): Fakes => ({
    computer: fakeComputer(),
    muninn: fakeMuninn(),
    claude: fakeClaude({ servers: [RIGHT_ENTRY] }),
    paseo: fakePaseo(),
})

type FakeLabel = { name: string; color: string; description: string }

/** A fake GitHub side for the repo, as `luca setup` uses it. */
const fakeGitHub = ({
    labels = [],
    login = 'asibilia',
    repo_name = 'asibilia/tmnb',
}: {
    labels?: FakeLabel[]
    login?: string | null
    repo_name?: string | null
} = {}) => {
    const store = labels.map((label) => ({ ...label }))
    const created: string[] = []
    return {
        github: {
            login: async () => login,
            githubRepo: async () => repo_name,
            issueLinks: async () => ({ sub_issues: true, dependencies: true }),
            listLabels: async () => store.map(({ name }) => name),
            createLabel: async ({ name }: { name: string }) => {
                if (store.some((label) => label.name === name)) {
                    throw new Error(`label ${name} already exists`)
                }
                created.push(name)
                store.push({ name, color: 'ededed', description: '' })
            },
        },
        labels: () => store.map((label) => ({ ...label })),
        created: () => [...created],
    }
}

/** The run labels a ready repo has. */
const RUN_LABELS: FakeLabel[] = [
    'ready-for-agent',
    'refactor',
    'needs-info',
].map((name) => ({ name, color: '123456', description: 'Mine' }))

const CONFIG_PATH = join('.luca', 'config.json')

const PACKAGE_JSON = JSON.stringify(
    {
        name: 'tmnb',
        private: true,
        scripts: {
            test: 'bun test',
            'type-check': 'tsc --noEmit',
            lint: 'eslint .',
        },
    },
    null,
    4
)

/** A new-style config with every check and a vault. */
const READY_CONFIG = `${JSON.stringify(
    {
        checks: {
            test: 'bun test',
            types: 'bun run type-check',
            lint: 'bun run lint',
        },
        muninn: { vault: 'tmnb' },
    },
    null,
    4
)}\n`

/** A throwaway repo with these files committed and a local bare `origin`. */
const makeRepo = async ({
    files,
    push = true,
}: {
    files: Record<string, string>
    push?: boolean
}) => {
    await $`git init -q --bare -b main ${origin}`.quiet()
    await $`git init -q -b main ${repo}`.quiet()
    const hooks = join(root, 'no-hooks')
    await mkdir(hooks)
    await git(repo, 'config', 'user.name', 'Practice')
    await git(repo, 'config', 'user.email', 'practice@example.com')
    await git(repo, 'config', 'commit.gpgsign', 'false')
    await git(repo, 'config', 'core.hooksPath', hooks)
    await Bun.write(join(repo, 'README.md'), '# Throwaway\n')
    for (const [path, content] of Object.entries(files)) {
        await Bun.write(join(repo, path), content)
    }
    await git(repo, 'add', '-A')
    await git(repo, 'commit', '-q', '-m', 'initial')
    await git(repo, 'remote', 'add', 'origin', origin)
    if (push) await git(repo, 'push', '-q', 'origin', 'main')
}

const doctor = ({
    fakes,
    fix = false,
    in_repo = null,
    v13_manifest,
}: {
    fakes: Fakes
    fix?: boolean
    in_repo?: {
        github: ReturnType<typeof fakeGitHub>['github']
        memory: FakeMuninn
    } | null
    /** The v13 fingerprint list; defaults to the committed one. */
    v13_manifest?: V13Manifest
}) =>
    runDoctor({
        home,
        fix,
        luca_version: LUCA_VERSION,
        board_dir,
        engine_path,
        bun_path,
        computer: fakes.computer,
        muninn: fakes.muninn.muninn,
        muninn_health: fakes.muninn.health,
        claude: fakes.claude.claude,
        paseo: fakes.paseo.paseo,
        repo:
            in_repo === null
                ? null
                : {
                      path: repo,
                      github: in_repo.github,
                      memory: in_repo.memory,
                  },
        tmp_dir,
        ...(v13_manifest === undefined ? {} : { v13_manifest }),
        log,
    })

type Check = {
    group: string
    name: string
    status: string
    detail: string
    fix?: string | null
}

const printed = (): string => logs.join('\n')

const lines = (): string[] => printed().split('\n')

const checkOf = (
    checks: Check[],
    name: string,
    group: 'computer' | 'repo' = 'computer'
): Check => {
    const found = checks.find(
        (check) => check.group === group && check.name === name
    )
    if (found === undefined) throw new Error(`No ${group} check ${name}`)
    return found
}

/** The check is OK, and a printed line says OK with its detail. */
const expectOk = (
    checks: Check[],
    name: string,
    group: 'computer' | 'repo' = 'computer'
) => {
    const check = checkOf(checks, name, group)
    expect({ name, status: check.status }).toEqual({ name, status: 'ok' })
    expect(
        lines().some(
            (line) => /\bOK\b/.test(line) && line.includes(check.detail)
        )
    ).toBe(true)
}

/** The check has this status, and its problem and its exact fix are printed. */
const expectFlagged = ({
    checks,
    name,
    status,
    fix,
    group = 'computer',
}: {
    checks: Check[]
    name: string
    status: 'problem' | 'warning'
    fix: RegExp
    group?: 'computer' | 'repo'
}): Check => {
    const check = checkOf(checks, name, group)
    expect({ name, status: check.status }).toEqual({ name, status })
    expect(check.detail.trim()).not.toBe('')
    expect(check.fix ?? '').toMatch(fix)
    expect(printed()).toContain(check.detail)
    expect(printed()).toContain(check.fix ?? '')
    return check
}

const expectProblem = (
    checks: Check[],
    name: string,
    fix: RegExp,
    group: 'computer' | 'repo' = 'computer'
) => expectFlagged({ checks, name, status: 'problem', fix, group })

const expectWarning = (checks: Check[], name: string, fix: RegExp) =>
    expectFlagged({ checks, name, status: 'warning', fix })

/** Every file under `dir`, relative to it, leaving out `.git`. */
const filesUnder = async (dir: string): Promise<string[]> =>
    (
        await Array.fromAsync(
            new Bun.Glob('**/*').scan({ cwd: dir, dot: true, onlyFiles: true })
        )
    )
        .filter((path) => !path.split('/').includes('.git'))
        .toSorted()

describe('luca doctor on a healthy computer', () => {
    test('every computer check prints OK and it exits 0', async () => {
        const end = await doctor({ fakes: healthy() })

        for (const name of COMPUTER_CHECKS) expectOk(end.checks, name)
        expect(end.exit_code).toBe(0)
    })

    test('outside a repo there are no repo checks', async () => {
        const end = await doctor({ fakes: healthy() })

        expect(end.checks.length).toBeGreaterThan(0)
        expect(
            end.checks.filter((check: Check) => check.group === 'repo')
        ).toEqual([])
    })
})

describe('luca doctor checks Bun', () => {
    test('Bun missing is a problem whose fix installs Bun, and it exits 1', async () => {
        const end = await doctor({
            fakes: { ...healthy(), computer: fakeComputer({ bun: null }) },
        })

        expectProblem(end.checks, 'bun', /bun\.sh/)
        expect(end.exit_code).toBe(1)
    })
})

describe('luca doctor checks the luca copies on the PATH', () => {
    test('a v13 copy under another npm prefix is a problem naming its path and how to remove it', async () => {
        const v13 = {
            path: '/opt/homebrew/bin/luca',
            package_name: '@alecsibilia/luca',
            version: '13.0.1',
        }
        const end = await doctor({
            fakes: {
                ...healthy(),
                computer: fakeComputer({ copies: [v14Copy(), v13] }),
            },
        })

        const check = expectProblem(end.checks, 'luca', /uninstall/)
        expect(check.fix ?? '').toContain('@alecsibilia/luca')
        expect(`${check.detail}\n${check.fix ?? ''}`).toContain(v13.path)
        expect(end.exit_code).toBe(1)
    })

    test('a v12 @alecsibilia/luca-framework copy is a problem whose fix removes that package', async () => {
        const v12 = {
            path: join(home, '.npm-global', 'bin', 'luca'),
            package_name: '@alecsibilia/luca-framework',
            version: '12.4.0',
        }
        const end = await doctor({
            fakes: {
                ...healthy(),
                computer: fakeComputer({ copies: [v12, v14Copy()] }),
            },
        })

        const check = expectProblem(end.checks, 'luca', /uninstall/)
        expect(check.fix ?? '').toContain('@alecsibilia/luca-framework')
        expect(`${check.detail}\n${check.fix ?? ''}`).toContain(v12.path)
        expect(end.exit_code).toBe(1)
    })

    test('a luca on the PATH that is not v14 is a problem', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                computer: fakeComputer({
                    copies: [
                        {
                            path: '/usr/local/bin/luca',
                            package_name: '@alecsibilia/luca',
                            version: '13.0.1',
                        },
                    ],
                }),
            },
        })

        expectProblem(end.checks, 'luca', /\S/)
        expect(end.exit_code).toBe(1)
    })
})

describe('luca doctor checks Claude Code and gh', () => {
    test('Claude Code versions are compared as numbers, so 2.10.0 is OK', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                computer: fakeComputer({ claude: '2.10.0' }),
            },
        })

        expectOk(end.checks, 'claude_code')
    })

    test('Claude Code older than 2.1.280 is a problem whose fix is claude update', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                computer: fakeComputer({ claude: '2.1.99' }),
            },
        })

        expectProblem(end.checks, 'claude_code', /claude update/)
        expect(end.exit_code).toBe(1)
    })

    test('Claude Code missing is a problem with how to install it', async () => {
        const end = await doctor({
            fakes: { ...healthy(), computer: fakeComputer({ claude: null }) },
        })

        expectProblem(end.checks, 'claude_code', /claude/i)
        expect(end.exit_code).toBe(1)
    })

    test('gh signed out is a problem whose fix is gh auth login', async () => {
        const end = await doctor({
            fakes: { ...healthy(), computer: fakeComputer({ gh: null }) },
        })

        expectProblem(end.checks, 'gh_login', /gh auth login/)
        expect(end.exit_code).toBe(1)
    })
})

describe('luca doctor checks Paseo', () => {
    test('Paseo 0.10.0 is OK, as versions are compared as numbers', async () => {
        const end = await doctor({
            fakes: { ...healthy(), paseo: fakePaseo({ version: '0.10.0' }) },
        })

        expectOk(end.checks, 'paseo')
    })

    test('Paseo older than 0.9.1 is a problem whose fix is to update Paseo', async () => {
        const end = await doctor({
            fakes: { ...healthy(), paseo: fakePaseo({ version: '0.9.0' }) },
        })

        expectProblem(end.checks, 'paseo', /Paseo/)
        expect(end.exit_code).toBe(1)
    })

    test('Paseo not running is a problem, and the other checks still run', async () => {
        const end = await doctor({
            fakes: { ...healthy(), paseo: fakePaseo({ running: false }) },
        })

        expectProblem(end.checks, 'paseo', /Paseo/)
        expectOk(end.checks, 'bun')
        expectOk(end.checks, 'gh_login')
        expectOk(end.checks, 'muninndb')
        expect(end.exit_code).toBe(1)
    })

    test('Paseo plugins off is a problem whose fix is to turn them on', async () => {
        const end = await doctor({
            fakes: { ...healthy(), paseo: fakePaseo({ enabled: false }) },
        })

        expectProblem(end.checks, 'paseo_plugins', /plugins/i)
        expect(end.exit_code).toBe(1)
    })
})

describe('luca doctor checks the board', () => {
    test('a board not installed in Paseo is a problem', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                paseo: fakePaseo({ plugins: [], settings: {} }),
            },
        })

        expectProblem(end.checks, 'board', /luca (doctor --fix|init)/)
        expect(end.exit_code).toBe(1)
    })

    test('a board installed from another folder than the Luca install folder is a problem', async () => {
        const old_board = join(home, 'old-clone', 'packages', 'board')
        const end = await doctor({
            fakes: {
                ...healthy(),
                paseo: fakePaseo({
                    plugins: [{ id: BOARD_ID, path: old_board }],
                }),
            },
        })

        const check = expectProblem(
            end.checks,
            'board',
            /luca (doctor --fix|init)/
        )
        expect(check.detail).toContain(old_board)
        expect(end.exit_code).toBe(1)
    })

    test('a board loaded at another version than the installed Luca is a problem naming both', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                paseo: fakePaseo({ board_version: '14.0.0-alpha.1' }),
            },
        })

        const check = expectProblem(end.checks, 'board', /luca doctor --fix/)
        expect(check.detail).toContain('14.0.0-alpha.1')
        expect(check.detail).toContain(LUCA_VERSION)
        expect(end.exit_code).toBe(1)
    })

    test('a board whose engine path is not the installed luca-run is a problem', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                paseo: fakePaseo({
                    settings: {
                        [BOARD_ID]: {
                            engine_path: '/old/luca-run.ts',
                            bun_path,
                        },
                    },
                }),
            },
        })

        expectProblem(end.checks, 'board', /luca doctor --fix/)
        expect(end.exit_code).toBe(1)
    })

    test('a board whose Bun path is not Bun itself is a problem', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                paseo: fakePaseo({
                    settings: {
                        [BOARD_ID]: { engine_path, bun_path: '/old/bun' },
                    },
                }),
            },
        })

        expectProblem(end.checks, 'board', /luca doctor --fix/)
        expect(end.exit_code).toBe(1)
    })
})

describe('luca doctor checks MuninnDB and its Claude Code entry', () => {
    test('MuninnDB not answering its health check is a problem whose fix starts it', async () => {
        const end = await doctor({
            fakes: { ...healthy(), muninn: fakeMuninn({ running: false }) },
        })

        expectProblem(end.checks, 'muninndb', /muninn start|luca doctor --fix/)
        expect(end.exit_code).toBe(1)
    })

    test('MuninnDB older than 0.11.0 is a problem whose fix is muninn upgrade, compared as numbers', async () => {
        const end = await doctor({
            fakes: { ...healthy(), muninn: fakeMuninn({ version: '0.9.12' }) },
        })

        expectProblem(end.checks, 'muninndb', /muninn upgrade/)
        expect(end.exit_code).toBe(1)
    })

    test('MuninnDB 0.12.3 is OK', async () => {
        const end = await doctor({
            fakes: { ...healthy(), muninn: fakeMuninn({ version: '0.12.3' }) },
        })

        expectOk(end.checks, 'muninndb')
    })

    test('no user-scope muninn entry in Claude Code is a problem', async () => {
        const end = await doctor({
            fakes: { ...healthy(), claude: fakeClaude() },
        })

        expectProblem(end.checks, 'muninn_entry', /luca (doctor --fix|init)/)
        expect(end.exit_code).toBe(1)
    })

    test('a muninn entry with the wrong token is a problem, and the token is never shown', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                claude: fakeClaude({
                    servers: [
                        {
                            ...RIGHT_ENTRY,
                            headers: { Authorization: 'Bearer mdb_old_token' },
                        },
                    ],
                }),
            },
        })

        expectProblem(end.checks, 'muninn_entry', /luca (doctor --fix|init)/)
        expect(printed()).not.toContain(TOKEN)
        expect(JSON.stringify(end) ?? '').not.toContain(TOKEN)
        expect(end.exit_code).toBe(1)
    })
})

describe('luca doctor when MuninnDB was skipped', () => {
    test('MuninnDB not installed is a memory off warning, and it exits 0', async () => {
        const end = await doctor({
            fakes: {
                ...healthy(),
                muninn: fakeMuninn({
                    installed: false,
                    initialized: false,
                    running: false,
                }),
                claude: fakeClaude(),
            },
        })

        const check = expectWarning(end.checks, 'muninndb', /\S/)
        expect(`${check.detail}\n${check.fix ?? ''}`).toMatch(/memory off/i)
        expect(end.checks.filter((c: Check) => c.status === 'problem')).toEqual(
            []
        )
        expect(end.exit_code).toBe(0)
    })
})

describe('luca doctor checks the planning skills', () => {
    test('a to-tickets that no longer writes Acceptance criteria is a warning, and it exits 0', async () => {
        await writeSkills({
            to_tickets: TO_TICKETS.replace('## Acceptance criteria\n', ''),
        })

        const end = await doctor({ fakes: healthy() })

        const check = expectWarning(end.checks, 'planning_skills', /\S/)
        expect(check.detail).toContain('Acceptance criteria')
        expect(end.exit_code).toBe(0)
    })

    test('a to-spec that no longer writes Testing Decisions is a warning', async () => {
        await writeSkills({
            to_spec: TO_SPEC.replace('## Testing Decisions\n', ''),
        })

        const end = await doctor({ fakes: healthy() })

        const check = expectWarning(end.checks, 'planning_skills', /\S/)
        expect(check.detail).toContain('Testing Decisions')
        expect(end.exit_code).toBe(0)
    })

    test('planning skills that no longer use the ready-for-agent label are a warning', async () => {
        await writeSkills({
            to_spec: TO_SPEC.replaceAll('ready-for-agent', 'ready'),
            to_tickets: TO_TICKETS.replaceAll('ready-for-agent', 'ready'),
        })

        const end = await doctor({ fakes: healthy() })

        const check = expectWarning(end.checks, 'planning_skills', /\S/)
        expect(check.detail).toContain('ready-for-agent')
        expect(end.exit_code).toBe(0)
    })
})

describe('luca doctor inside a repo', () => {
    test('in a ready repo every repo check prints OK and it exits 0', async () => {
        await makeRepo({
            files: {
                'package.json': PACKAGE_JSON,
                [CONFIG_PATH]: READY_CONFIG,
            },
        })

        const end = await doctor({
            fakes: healthy(),
            in_repo: {
                github: fakeGitHub({ labels: RUN_LABELS }).github,
                memory: createFakeMuninn({ vaults: { tmnb: [] } }),
            },
        })

        for (const name of REPO_CHECKS) expectOk(end.checks, name, 'repo')
        expect(end.exit_code).toBe(0)
    }, 60_000)

    test('missing labels and no config are problems, and nothing is created or written', async () => {
        await makeRepo({ files: { 'package.json': PACKAGE_JSON } })
        const github = fakeGitHub()

        const end = await doctor({
            fakes: healthy(),
            in_repo: { github: github.github, memory: createFakeMuninn() },
        })

        expectProblem(end.checks, 'labels', /luca (setup|doctor --fix)/, 'repo')
        expectProblem(end.checks, 'config', /luca (setup|doctor --fix)/, 'repo')
        expect(github.created()).toEqual([])
        expect(await Bun.file(join(repo, CONFIG_PATH)).exists()).toBe(false)
        expect((await git(repo, 'status', '--porcelain')).trim()).toBe('')
        expect(end.exit_code).toBe(1)
    }, 60_000)

    test('an old-Luca config is a problem, and it is left as it is', async () => {
        const old = JSON.stringify(
            { lucaVersion: '13.0.1', muninn: { vault: 'tmnb' } },
            null,
            2
        )
        await makeRepo({
            files: { 'package.json': PACKAGE_JSON, [CONFIG_PATH]: old },
        })

        const end = await doctor({
            fakes: healthy(),
            in_repo: {
                github: fakeGitHub({ labels: RUN_LABELS }).github,
                memory: createFakeMuninn({ vaults: { tmnb: [] } }),
            },
        })

        expectProblem(end.checks, 'config', /luca (setup|doctor --fix)/, 'repo')
        expect(await Bun.file(join(repo, CONFIG_PATH)).text()).toBe(old)
        expect(end.exit_code).toBe(1)
    }, 60_000)

    test('a base branch missing on origin is a problem with its fix', async () => {
        await makeRepo({
            files: {
                'package.json': PACKAGE_JSON,
                [CONFIG_PATH]: READY_CONFIG,
            },
            push: false,
        })

        const end = await doctor({
            fakes: healthy(),
            in_repo: {
                github: fakeGitHub({ labels: RUN_LABELS }).github,
                memory: createFakeMuninn({ vaults: { tmnb: [] } }),
            },
        })

        expectProblem(end.checks, 'base_branch', /git push/, 'repo')
        expect(end.exit_code).toBe(1)
    }, 60_000)

    test('a repo with no GitHub remote is a problem with its fix', async () => {
        await makeRepo({
            files: {
                'package.json': PACKAGE_JSON,
                [CONFIG_PATH]: READY_CONFIG,
            },
        })

        const end = await doctor({
            fakes: healthy(),
            in_repo: {
                github: fakeGitHub({ repo_name: null }).github,
                memory: createFakeMuninn({ vaults: { tmnb: [] } }),
            },
        })

        expectProblem(end.checks, 'github_remote', /\S/, 'repo')
        expect(end.exit_code).toBe(1)
    }, 60_000)

    test('a vault MuninnDB cannot reach is a problem with its fix', async () => {
        await makeRepo({
            files: {
                'package.json': PACKAGE_JSON,
                [CONFIG_PATH]: READY_CONFIG,
            },
        })

        const end = await doctor({
            fakes: healthy(),
            in_repo: {
                github: fakeGitHub({ labels: RUN_LABELS }).github,
                memory: createFakeMuninn({ fail: [{ vault: 'tmnb' }] }),
            },
        })

        expectProblem(end.checks, 'vault', /\S/, 'repo')
        expect(end.exit_code).toBe(1)
    }, 60_000)
})

describe('luca doctor --fix repairs what is safe', () => {
    test('MuninnDB down is started with muninn start', async () => {
        const fakes = { ...healthy(), muninn: fakeMuninn({ running: false }) }

        const end = await doctor({ fakes, fix: true })

        expect(events).toContain('muninn start')
        expect(fakes.muninn.running()).toBe(true)
        expectOk(end.checks, 'muninndb')
        expect(end.exit_code).toBe(0)
    })

    test('a wrong muninn entry is removed, then the right one is added', async () => {
        const fakes = {
            ...healthy(),
            claude: fakeClaude({
                servers: [
                    {
                        ...RIGHT_ENTRY,
                        headers: { Authorization: 'Bearer mdb_old_token' },
                    },
                ],
            }),
        }

        const end = await doctor({ fakes, fix: true })

        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([
            'claude mcp remove user muninn',
            'claude mcp add user muninn',
        ])
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
        expectOk(end.checks, 'muninn_entry')
        expect(printed()).not.toContain(TOKEN)
        expect(end.exit_code).toBe(0)
    })

    test('a missing muninn entry is added', async () => {
        const fakes = { ...healthy(), claude: fakeClaude() }

        const end = await doctor({ fakes, fix: true })

        expect(events.filter((e) => e.startsWith('claude mcp '))).toEqual([
            'claude mcp add user muninn',
        ])
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
        expectOk(end.checks, 'muninn_entry')
    })

    test('a board loaded at another version is reloaded, not removed, and its settings are kept', async () => {
        const paseo = fakePaseo({ board_version: '14.0.0-alpha.1' })

        const end = await doctor({ fakes: { ...healthy(), paseo }, fix: true })

        expect(paseo_events).toContain(`reload ${BOARD_ID}`)
        expect(paseo_events).not.toContain(`remove ${BOARD_ID}`)
        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
        expect(paseo.settings(BOARD_ID)).toEqual({
            engine_path,
            bun_path,
            ...TUNED_LINES,
        })
        expectOk(end.checks, 'board')
        expect(end.exit_code).toBe(0)
    })

    test('stale board paths are rewritten and the usage lines are kept', async () => {
        const paseo = fakePaseo({
            settings: {
                [BOARD_ID]: {
                    engine_path: '/old/luca-run.ts',
                    bun_path: '/old/bun',
                    ...TUNED_LINES,
                },
            },
        })

        const end = await doctor({ fakes: { ...healthy(), paseo }, fix: true })

        expect(paseo_events).toContain(`reload ${BOARD_ID}`)
        expect(paseo.settings(BOARD_ID)).toEqual({
            engine_path,
            bun_path,
            ...TUNED_LINES,
        })
        expectOk(end.checks, 'board')
    })

    test('a board installed from another folder is moved to the Luca install folder with its settings kept', async () => {
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
            board_version: '2026.09.01',
        })

        const end = await doctor({ fakes: { ...healthy(), paseo }, fix: true })

        expect(paseo.plugins()).toEqual([{ id: BOARD_ID, path: board_dir }])
        expect(paseo.settings(BOARD_ID)).toEqual({
            engine_path,
            bun_path,
            ...TUNED_LINES,
        })
        expectOk(end.checks, 'board')
    })

    test('with nothing wrong, it changes nothing', async () => {
        const fakes = healthy()

        const end = await doctor({ fakes, fix: true })

        expect(events).toEqual([])
        expect(fakes.claude.servers()).toEqual([RIGHT_ENTRY])
        expect(paseo_events).not.toContain(`remove ${BOARD_ID}`)
        expect(
            paseo_events.filter((event) => event.startsWith('install '))
        ).toEqual([])
        expect(end.exit_code).toBe(0)
    })

    test('in a repo it runs luca setup: labels created and config written, nothing committed', async () => {
        await makeRepo({ files: { 'package.json': PACKAGE_JSON } })
        const head = (await git(repo, 'rev-parse', 'HEAD')).trim()
        const origin_head = (await git(origin, 'rev-parse', 'main')).trim()
        const github = fakeGitHub()

        const end = await doctor({
            fakes: healthy(),
            fix: true,
            in_repo: { github: github.github, memory: createFakeMuninn() },
        })

        expect(github.created().toSorted()).toEqual([
            'needs-info',
            'ready-for-agent',
            'refactor',
        ])
        expect(await Bun.file(join(repo, CONFIG_PATH)).exists()).toBe(true)
        expectOk(end.checks, 'labels', 'repo')
        expectOk(end.checks, 'config', 'repo')
        expect((await git(repo, 'rev-parse', 'HEAD')).trim()).toBe(head)
        expect((await git(repo, 'rev-list', '--count', 'main')).trim()).toBe(
            '1'
        )
        expect((await git(origin, 'rev-parse', 'main')).trim()).toBe(
            origin_head
        )
        // The config is left for the user to commit: untracked, not staged.
        expect(
            await git(repo, 'status', '--porcelain', '--untracked-files=all')
        ).toContain('?? .luca/config.json')
        // It lists what to commit.
        expect(printed()).toContain('.luca/config.json')
    }, 60_000)

    test('it deletes nothing in the home folder or the repo', async () => {
        await makeRepo({
            files: {
                'package.json': PACKAGE_JSON,
                [CONFIG_PATH]: JSON.stringify(
                    { lucaVersion: '13.0.1', vault: 'tmnb' },
                    null,
                    2
                ),
            },
        })
        const v13_bin = join(home, '.npm-global', 'bin', 'luca')
        await mkdir(join(home, '.npm-global', 'bin'), { recursive: true })
        await Bun.write(v13_bin, '#!/usr/bin/env node\n')
        const home_before = await filesUnder(home)
        const repo_before = await filesUnder(repo)
        const fakes = {
            computer: fakeComputer({
                copies: [
                    v14Copy(),
                    {
                        path: v13_bin,
                        package_name: '@alecsibilia/luca',
                        version: '13.0.1',
                    },
                ],
            }),
            muninn: fakeMuninn({ running: false }),
            claude: fakeClaude(),
            paseo: fakePaseo({ board_version: '14.0.0-alpha.1' }),
        }

        await doctor({
            fakes,
            fix: true,
            in_repo: {
                github: fakeGitHub().github,
                memory: createFakeMuninn({ vaults: { tmnb: [] } }),
            },
        })

        const home_after = await filesUnder(home)
        const repo_after = await filesUnder(repo)
        for (const file of home_before) expect(home_after).toContain(file)
        for (const file of repo_before) expect(repo_after).toContain(file)
        expect(events).toContain('muninn start')
    }, 60_000)
})

describe('luca doctor --fix only reports what needs the user', () => {
    test('missing Bun and Claude Code are reported, not installed, and MuninnDB is not installed', async () => {
        const fakes = {
            ...healthy(),
            computer: fakeComputer({ bun: null, claude: null }),
            muninn: fakeMuninn({
                installed: false,
                initialized: false,
                running: false,
            }),
            claude: fakeClaude(),
        }

        const end = await doctor({ fakes, fix: true })

        expectProblem(end.checks, 'bun', /bun\.sh/)
        expectProblem(end.checks, 'claude_code', /claude/i)
        expectWarning(end.checks, 'muninndb', /\S/)
        expect(events).not.toContain('muninn install')
        expect(events.filter((e) => e.startsWith('muninn '))).toEqual([])
        expect(end.exit_code).toBe(1)
    })

    test('a signed-out gh is reported with gh auth login', async () => {
        const end = await doctor({
            fakes: { ...healthy(), computer: fakeComputer({ gh: null }) },
            fix: true,
        })

        expectProblem(end.checks, 'gh_login', /gh auth login/)
        expect(end.exit_code).toBe(1)
    })

    test('Paseo plugins off are reported, and not turned on without consent', async () => {
        const paseo = fakePaseo({ enabled: false })

        const end = await doctor({ fakes: { ...healthy(), paseo }, fix: true })

        expectProblem(end.checks, 'paseo_plugins', /plugins/i)
        expect(paseo_events).not.toContain('enable plugins')
        expect(paseo.enabled()).toBe(false)
        expect(end.exit_code).toBe(1)
    })

    test('another luca copy is reported, and its file is left in place', async () => {
        const v13_bin = join(home, '.npm-global', 'bin', 'luca')
        await mkdir(join(home, '.npm-global', 'bin'), { recursive: true })
        await Bun.write(v13_bin, '#!/usr/bin/env node\n')

        const end = await doctor({
            fakes: {
                ...healthy(),
                computer: fakeComputer({
                    copies: [
                        v14Copy(),
                        {
                            path: v13_bin,
                            package_name: '@alecsibilia/luca',
                            version: '13.0.1',
                        },
                    ],
                }),
            },
            fix: true,
        })

        expectProblem(end.checks, 'luca', /uninstall/)
        expect(await Bun.file(v13_bin).exists()).toBe(true)
        expect(end.exit_code).toBe(1)
    })
})

/** A `skills` tool that already has every planning skill. */
const skillsHaveAll = () => ({
    installedSkills: async () => [
        'to-spec',
        'to-tickets',
        'setup-matt-pocock-skills',
        'grilling',
        'domain-modeling',
    ],
    installSkills: async () => undefined,
})

/** A `launchctl` whose login item is already loaded. */
const launchctlLoaded = () => ({
    loaded: async () => true,
    load: async () => undefined,
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
        skip_skills: false,
        muninn: fakes.muninn.muninn,
        muninn_health: fakes.muninn.health,
        claude: fakes.claude.claude,
        launchctl: launchctlLoaded(),
        paseo: fakes.paseo.paseo,
        skills: skillsHaveAll(),
        ask: async () => false,
        computer: fakes.computer,
        luca_version: LUCA_VERSION,
        board_dir,
        engine_path,
        bun_path,
        log,
    })

describe('luca init ends with the computer checks', () => {
    test('its end holds the computer checks, printed after its own steps', async () => {
        const end = await init({
            fakes: { ...healthy(), computer: fakeComputer({ gh: null }) },
        })

        const checks: Check[] = end.doctor
        expect(checks.map(({ name }) => name).toSorted()).toEqual(
            [...COMPUTER_CHECKS].toSorted()
        )
        expect(checks.every(({ group }) => group === 'computer')).toBe(true)
        expectProblem(checks, 'gh_login', /gh auth login/)
        expectOk(checks, 'board')
        const skills_line = lines().findIndex((line) =>
            line.includes('Planning skills')
        )
        const gh_line = lines().findLastIndex((line) =>
            line.includes('gh auth login')
        )
        expect(skills_line).toBeGreaterThan(-1)
        expect(gh_line).toBeGreaterThan(skills_line)
    })

    test('with MuninnDB skipped, its checks warn that memory is off', async () => {
        const end = await init({
            fakes: {
                ...healthy(),
                muninn: fakeMuninn({
                    installed: false,
                    initialized: false,
                    running: false,
                }),
                claude: fakeClaude(),
            },
            skip_muninndb: true,
        })

        const check = expectWarning(end.doctor, 'muninndb', /\S/)
        expect(`${check.detail}\n${check.fix ?? ''}`).toMatch(/memory off/i)
    })
})

describe('luca setup ends with the repo checks', () => {
    test('its end holds the repo checks, with the labels and config it just made OK', async () => {
        await makeRepo({ files: { 'package.json': PACKAGE_JSON } })

        const end = await runSetup({
            repo,
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
            log,
        })

        const checks: Check[] = end.doctor
        expect(checks.length).toBeGreaterThan(0)
        expect(checks.every(({ group }) => group === 'repo')).toBe(true)
        for (const name of REPO_CHECKS) {
            expect(checks.map((check) => check.name)).toContain(name)
        }
        expectOk(checks, 'labels', 'repo')
        expectOk(checks, 'config', 'repo')
    }, 60_000)

    test('a problem setup cannot fix shows in its repo checks with its fix', async () => {
        await makeRepo({
            files: {
                'package.json': PACKAGE_JSON,
                [CONFIG_PATH]: READY_CONFIG,
            },
            push: false,
        })

        const end = await runSetup({
            repo,
            github: fakeGitHub({ labels: RUN_LABELS }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
            log,
        })

        expectProblem(end.doctor, 'base_branch', /git push/, 'repo')
    }, 60_000)
})

/*
 * v13 leftovers. The committed fingerprint list holds only hashes, so each
 * test seeds stand-in files at v13's targets and hands doctor a copy of the
 * list with the stand-ins' sha256 added: the same list, the same matching.
 */

/** v13 files seeded in the home folder, by their target in the list. */
const HOME_STAND_INS = [
    '~/.claude/skills/lu/SKILL.md',
    '~/.claude/agents/plan.md',
    '~/.claude/commands/luca-init.md',
    '~/.claude/luca-statusline.ts',
    '~/.gemini/antigravity-cli/skills/lu/SKILL.md',
    '~/.gemini/antigravity-cli/agents/plan.md',
]

/** v13's hook scripts, seeded in the repo. */
const REPO_STAND_INS = [
    '<repo>/.claude/hooks/context-refresher.ts',
    '<repo>/.claude/hooks/continuation-messages.ts',
    '<repo>/.claude/hooks/pipeline-guard.ts',
]

const standIn = (target: string) => `// A v13 stand-in for ${target}\n`

const sha256 = (text: string) =>
    new Bun.CryptoHasher('sha256').update(text).digest('hex')

/** The committed fingerprint list, plus the stand-ins' hashes. */
const manifestWithStandIns = async (): Promise<V13Manifest> => {
    const manifest = await loadV13Manifest()
    const targets = [...HOME_STAND_INS, ...REPO_STAND_INS]
    for (const target of targets) {
        if (!manifest.files.some((file) => file.target === target)) {
            throw new Error(`${target} is not in the v13 fingerprint list`)
        }
    }
    return {
        ...manifest,
        files: manifest.files.map((file) =>
            targets.includes(file.target)
                ? {
                      ...file,
                      sha256: [...file.sha256, sha256(standIn(file.target))],
                  }
                : file
        ),
    }
}

/** A target's path in the throwaway home. */
const inHome = (target: string) => join(home, target.slice('~/'.length))

/** A target's path, relative to the repo. */
const inRepo = (target: string) => target.slice('<repo>/'.length)

/** A hook entry of the user's own, which must outlive the cleanup. */
const USER_HOOK = {
    matcher: 'Bash',
    hooks: [{ type: 'command', command: 'my-own-guard.sh' }],
}

/** v13's global stage-gate hook, exactly as v13 wrote it. */
const STAGE_GATE_HOOK = {
    matcher: 'Edit|Write|NotebookEdit|Bash',
    hooks: [{ type: 'command', command: 'luca hook stage-gate', timeout: 30 }],
}

const repoHook = (name: string, matcher: string) => ({
    hooks: [
        {
            type: 'command',
            command: `bun "$CLAUDE_PROJECT_DIR"/.claude/hooks/${name}.ts`,
            timeout: 5,
        },
    ],
    matcher,
})

/** A stray payload v13 left in `/tmp`. */
const TMP_PAYLOAD = 'luca-3f2a9c.json'

/** Where `--fix` puts v13's files: dated folders under here. */
const backupRoot = () => join(home, '.local', 'state', 'luca', 'v13-backup')

/**
 * Seeds the home folder and the temp folder with what v13 left behind: its
 * skills, agents, commands, and status line script, the global hook and the
 * status line in Claude Code's settings, `~/.luca/`, Antigravity's copies,
 * and a stray payload. With `muninn_data`, `~/.luca/`'s MuninnDB data folder
 * holds data.
 */
const seedHomeV13 = async ({
    muninn_data = false,
}: { muninn_data?: boolean } = {}) => {
    for (const target of HOME_STAND_INS) {
        await Bun.write(inHome(target), standIn(target))
    }
    await Bun.write(
        join(home, '.claude', 'settings.json'),
        JSON.stringify(
            {
                model: 'opus',
                hooks: { PreToolUse: [USER_HOOK, STAGE_GATE_HOOK] },
                statusLine: {
                    type: 'command',
                    command: `bun "${home}/.claude/luca-statusline.ts"`,
                    padding: 0,
                },
            },
            null,
            2
        )
    )
    await Bun.write(
        join(home, '.gemini', 'antigravity-cli', 'hooks.json'),
        JSON.stringify(
            {
                'luca-stage-gate': {
                    enabled: true,
                    PreToolUse: [
                        {
                            matcher:
                                'replace|write_file|run_shell_command|run_command',
                            hooks: [
                                {
                                    type: 'command',
                                    command: 'luca hook stage-gate',
                                    timeout: 30,
                                },
                            ],
                        },
                    ],
                },
            },
            null,
            2
        )
    )
    await Bun.write(
        join(home, '.gemini', 'antigravity-cli', 'mcp_config.json'),
        JSON.stringify(
            {
                mcpServers: {
                    muninn: {
                        serverUrl: MUNINN_MCP_URL,
                        headers: { Authorization: `Bearer ${TOKEN}` },
                        enabledTools: ['*'],
                    },
                    my_server: { serverUrl: 'http://127.0.0.1:9999/mcp' },
                },
            },
            null,
            2
        )
    )
    await Bun.write(join(home, '.luca', 'bin', 'muninndb'), 'v13 muninndb\n')
    await mkdir(join(home, '.luca', 'muninndb-data'), { recursive: true })
    if (muninn_data) {
        await Bun.write(
            join(home, '.luca', 'muninndb-data', 'vault-0001.db'),
            'memories\n'
        )
    }
    await Bun.write(join(tmp_dir, TMP_PAYLOAD), '{"hook":"stage-gate"}\n')
}

/** The repo's `.gitignore`: the user's lines, then v13's managed block. */
const v13Gitignore = async () => {
    const { variants } = (await loadV13Manifest()).gitignore_block
    const block = variants[variants.length - 1]
    if (block === undefined) throw new Error('No .gitignore block variant')
    return `node_modules/\ndist/\n\n${[...block.header, ...block.entries].join('\n')}\n`
}

/** A repo where v13's `luca init` ran, all of it committed. */
const makeV13Repo = async () =>
    makeRepo({
        files: {
            'package.json': PACKAGE_JSON,
            [CONFIG_PATH]: JSON.stringify(
                { lucaVersion: '13.0.1', vault: 'tmnb' },
                null,
                2
            ),
            '.claude/settings.json': JSON.stringify(
                {
                    permissions: { allow: ['Bash(bun test)'] },
                    hooks: {
                        PreToolUse: [
                            repoHook('pipeline-guard', 'Bash'),
                            USER_HOOK,
                        ],
                        PostToolUse: [
                            repoHook('context-refresher', '*'),
                            repoHook('continuation-messages', 'Bash'),
                        ],
                    },
                },
                null,
                2
            ),
            '.claude/cache/context-refresher-state.json': '{"calls":3}\n',
            '.gitignore': await v13Gitignore(),
            ...Object.fromEntries(
                REPO_STAND_INS.map((target) => [
                    inRepo(target),
                    standIn(target),
                ])
            ),
        },
    })

const inV13Repo = () => ({
    github: fakeGitHub().github,
    memory: createFakeMuninn({ vaults: { tmnb: [] } }),
})

/** The v13 checks that aren't OK. */
const v13Found = (checks: Check[]): Check[] =>
    checks.filter((check) => check.group === 'v13' && check.status !== 'ok')

/** What the v13 checks that aren't OK say, and their fixes. */
const v13Text = (checks: Check[]): string =>
    v13Found(checks)
        .map((check) => `${check.detail}\n${check.fix ?? ''}`)
        .join('\n')

/** Every file under `dir` (leaving out `.git`) and its text, by relative path. */
const snapshot = async (dir: string): Promise<Map<string, string>> => {
    const files = new Map<string, string>()
    if (!existsSync(dir)) return files
    for (const path of await filesUnder(dir)) {
        files.set(path, await Bun.file(join(dir, path)).text())
    }
    return files
}

/** The backed-up file whose path ends with `path`, and its text. */
const backedUp = (backup: Map<string, string>, path: string) =>
    [...backup].find(
        ([file]) => file === path || file.endsWith(`/${path}`)
    )?.[1]

/** Every file from `before` is still at its path, or in the backup as it was. */
const expectNothingDeleted = async ({
    dir,
    before,
    backup,
}: {
    dir: string
    before: Map<string, string>
    backup: Map<string, string>
}) => {
    for (const [path, text] of before) {
        const kept = existsSync(join(dir, path))
        expect({
            path,
            kept: kept || backedUp(backup, path) === text,
        }).toEqual({ path, kept: true })
    }
}

describe('luca doctor finds v13 leftovers', () => {
    test('on the computer it finds the global hook, the status line, v13 skills, agents, and commands, ~/.luca, Antigravity copies, and /tmp payloads', async () => {
        await seedHomeV13()

        const end = await doctor({
            fakes: healthy(),
            v13_manifest: await manifestWithStandIns(),
        })

        const found = v13Found(end.checks)
        expect(found.length).toBeGreaterThan(0)
        for (const check of found) {
            expect(check.fix ?? '').not.toBe('')
            expect(printed()).toContain(check.detail)
        }
        const text = v13Text(end.checks)
        expect(text).toContain('stage-gate')
        expect(text).toMatch(/status ?line/i)
        for (const target of HOME_STAND_INS) {
            expect(text).toContain(target.slice('~/'.length))
        }
        expect(
            text.includes('~/.luca') || text.includes(join(home, '.luca'))
        ).toBe(true)
        expect(text).toContain('antigravity-cli/hooks.json')
        expect(text).toContain('antigravity-cli/mcp_config.json')
        expect(text).toContain(TMP_PAYLOAD)
        expect(printed()).not.toContain(TOKEN)
    })

    test('in the repo it finds the hook scripts, their wiring, the cache file, and the managed .gitignore block', async () => {
        await makeV13Repo()

        const end = await doctor({
            fakes: healthy(),
            in_repo: inV13Repo(),
            v13_manifest: await manifestWithStandIns(),
        })

        const text = v13Text(end.checks)
        for (const target of REPO_STAND_INS) {
            expect(text).toContain(inRepo(target))
        }
        expect(text).toContain('.claude/settings.json')
        expect(text).toContain('.claude/cache')
        expect(text).toContain('.gitignore')
        for (const check of v13Found(end.checks)) {
            expect(check.fix ?? '').not.toBe('')
            expect(printed()).toContain(check.detail)
        }
    }, 60_000)

    test('without --fix it reports the leftovers and changes nothing', async () => {
        await seedHomeV13()
        await makeV13Repo()
        const home_before = await snapshot(home)
        const repo_before = await snapshot(repo)
        const tmp_before = await snapshot(tmp_dir)

        const end = await doctor({
            fakes: healthy(),
            in_repo: inV13Repo(),
            v13_manifest: await manifestWithStandIns(),
        })

        expect(v13Found(end.checks).length).toBeGreaterThan(0)
        expect(await snapshot(home)).toEqual(home_before)
        expect(await snapshot(repo)).toEqual(repo_before)
        expect(await snapshot(tmp_dir)).toEqual(tmp_before)
    }, 60_000)

    test('with no v13 leftovers, the v13 group prints OK and the migration guide is not linked', async () => {
        await Bun.write(join(tmp_dir, 'notes.json'), '{}\n')

        const end = await doctor({
            fakes: healthy(),
            v13_manifest: await manifestWithStandIns(),
        })

        const v13 = end.checks.filter((check: Check) => check.group === 'v13')
        expect(v13.length).toBeGreaterThan(0)
        for (const check of v13) {
            expect(check.status).toBe('ok')
            expect(
                lines().some(
                    (line) => /\bOK\b/.test(line) && line.includes(check.detail)
                )
            ).toBe(true)
        }
        expect(printed()).not.toContain('migrating-')
        expect(end.exit_code).toBe(0)
    })
})

describe('luca doctor matches v13 files by content, not by name', () => {
    test('a same-named file with different content is not reported, and --fix leaves it in place', async () => {
        await seedHomeV13()
        const research = join(home, '.claude', 'agents', 'research.md')
        const grill_me = join(home, '.claude', 'skills', 'grill-me', 'SKILL.md')
        const lu_command = join(home, '.claude', 'commands', 'lu.md')
        const mine = new Map([
            [research, '# My own research agent\n'],
            [grill_me, '# My own grill-me skill\n'],
            [lu_command, '# My own /lu command\n'],
        ])
        for (const [path, text] of mine) await Bun.write(path, text)
        const manifest = await manifestWithStandIns()

        const found = await doctor({
            fakes: healthy(),
            v13_manifest: manifest,
        })

        const text = v13Text(found.checks)
        expect(text).toContain('.claude/agents/plan.md')
        expect(text).not.toContain('agents/research.md')
        expect(text).not.toContain('skills/grill-me')
        expect(text).not.toContain('commands/lu.md')

        await doctor({ fakes: healthy(), fix: true, v13_manifest: manifest })

        for (const [path, text] of mine) {
            expect(await Bun.file(path).text()).toBe(text)
        }
        const backup = await snapshot(backupRoot())
        expect(backedUp(backup, '.claude/agents/research.md')).toBeUndefined()
        expect(
            backedUp(backup, '.claude/skills/grill-me/SKILL.md')
        ).toBeUndefined()
        expect(backedUp(backup, '.claude/commands/lu.md')).toBeUndefined()
    })
})

describe('luca doctor --fix cleans up v13 leftovers', () => {
    test('matched files move to one dated backup folder with their paths kept', async () => {
        await seedHomeV13()
        await makeV13Repo()

        await doctor({
            fakes: healthy(),
            fix: true,
            in_repo: inV13Repo(),
            v13_manifest: await manifestWithStandIns(),
        })

        const dated = readdirSync(backupRoot())
        expect(dated).toHaveLength(1)
        expect(dated[0]).toMatch(/^\d{4}-\d{2}-\d{2}/)
        const backup = await snapshot(backupRoot())
        for (const path of backup.keys()) {
            expect(path.startsWith(`${dated[0]}/`)).toBe(true)
        }
        for (const target of HOME_STAND_INS) {
            const path = target.slice('~/'.length)
            expect({ path, left: existsSync(inHome(target)) }).toEqual({
                path,
                left: false,
            })
            expect(backedUp(backup, path)).toBe(standIn(target))
        }
        for (const target of REPO_STAND_INS) {
            const path = inRepo(target)
            expect({ path, left: existsSync(join(repo, path)) }).toEqual({
                path,
                left: false,
            })
            expect(backedUp(backup, path)).toBe(standIn(target))
        }
    }, 60_000)

    test('it unwires the global hook, the status line, and the repo hooks, and keeps the user own settings', async () => {
        await seedHomeV13()
        await makeV13Repo()

        await doctor({
            fakes: healthy(),
            fix: true,
            in_repo: inV13Repo(),
            v13_manifest: await manifestWithStandIns(),
        })

        const user_settings = await Bun.file(
            join(home, '.claude', 'settings.json')
        ).json()
        expect(user_settings.model).toBe('opus')
        expect(user_settings.statusLine).toBeUndefined()
        expect(user_settings.hooks.PreToolUse).toEqual([USER_HOOK])

        const repo_settings = await Bun.file(
            join(repo, '.claude', 'settings.json')
        ).json()
        expect(repo_settings.permissions).toEqual({
            allow: ['Bash(bun test)'],
        })
        expect(repo_settings.hooks?.PreToolUse).toEqual([USER_HOOK])
        expect(repo_settings.hooks?.PostToolUse ?? []).toEqual([])
        expect(JSON.stringify(repo_settings)).not.toContain('.claude/hooks/')

        const antigravity_hooks = await Bun.file(
            join(home, '.gemini', 'antigravity-cli', 'hooks.json')
        ).json()
        expect(antigravity_hooks['luca-stage-gate']).toBeUndefined()
    }, 60_000)

    test('when the repo hook wiring cannot be removed, the hook scripts stay in place', async () => {
        await makeV13Repo()
        // Neither a write in place nor a write-and-rename can change it.
        const claude_dir = join(repo, '.claude')
        await chmod(join(claude_dir, 'settings.json'), 0o444)
        await chmod(claude_dir, 0o555)
        try {
            const end = await doctor({
                fakes: healthy(),
                fix: true,
                in_repo: inV13Repo(),
                v13_manifest: await manifestWithStandIns(),
            })

            for (const target of REPO_STAND_INS) {
                const path = inRepo(target)
                expect({ path, kept: existsSync(join(repo, path)) }).toEqual({
                    path,
                    kept: true,
                })
            }
            expect(v13Text(end.checks)).toContain('.claude/settings.json')
        } finally {
            await chmod(claude_dir, 0o755)
            await chmod(join(claude_dir, 'settings.json'), 0o644)
        }
    }, 60_000)

    test('it deletes nothing in the home folder, the repo, or the temp folder', async () => {
        await seedHomeV13()
        await makeV13Repo()
        await Bun.write(join(tmp_dir, 'notes.json'), '{}\n')
        const home_before = await snapshot(home)
        const repo_before = await snapshot(repo)
        const tmp_before = await snapshot(tmp_dir)

        await doctor({
            fakes: healthy(),
            fix: true,
            in_repo: inV13Repo(),
            v13_manifest: await manifestWithStandIns(),
        })

        const backup = await snapshot(backupRoot())
        // The cleanup ran: v13's files were moved, not deleted.
        expect(backup.size).toBeGreaterThan(0)
        await expectNothingDeleted({ dir: home, before: home_before, backup })
        await expectNothingDeleted({ dir: repo, before: repo_before, backup })
        await expectNothingDeleted({ dir: tmp_dir, before: tmp_before, backup })
        expect(await Bun.file(join(tmp_dir, 'notes.json')).text()).toBe('{}\n')
    }, 60_000)

    test('~/.luca/ with an empty MuninnDB data folder moves to the backup', async () => {
        await seedHomeV13()

        await doctor({
            fakes: healthy(),
            fix: true,
            v13_manifest: await manifestWithStandIns(),
        })

        expect(existsSync(join(home, '.luca'))).toBe(false)
        const backup = await snapshot(backupRoot())
        expect(backedUp(backup, '.luca/bin/muninndb')).toBe('v13 muninndb\n')
    })
})

describe('luca doctor --fix keeps ~/.luca/ holding MuninnDB data', () => {
    test('~/.luca/ stays in place, still reported, when its MuninnDB data folder is not empty', async () => {
        await seedHomeV13({ muninn_data: true })

        const end = await doctor({
            fakes: healthy(),
            fix: true,
            v13_manifest: await manifestWithStandIns(),
        })

        expect(
            await Bun.file(
                join(home, '.luca', 'muninndb-data', 'vault-0001.db')
            ).text()
        ).toBe('memories\n')
        expect(
            await Bun.file(join(home, '.luca', 'bin', 'muninndb')).text()
        ).toBe('v13 muninndb\n')
        const backup = await snapshot(backupRoot())
        expect(
            backedUp(backup, '.luca/muninndb-data/vault-0001.db')
        ).toBeUndefined()
        expect(backedUp(backup, '.luca/bin/muninndb')).toBeUndefined()
        const text = v13Text(end.checks)
        expect(
            text.includes('~/.luca') || text.includes(join(home, '.luca'))
        ).toBe(true)
    })
})

describe('luca doctor --fix commits nothing after v13 cleanup', () => {
    test('nothing is committed or staged, and the de-hooked settings and the new config are listed to commit', async () => {
        await seedHomeV13()
        await makeV13Repo()
        const head = (await git(repo, 'rev-parse', 'HEAD')).trim()
        const origin_head = (await git(origin, 'rev-parse', 'main')).trim()

        await doctor({
            fakes: healthy(),
            fix: true,
            in_repo: inV13Repo(),
            v13_manifest: await manifestWithStandIns(),
        })

        expect((await git(repo, 'rev-parse', 'HEAD')).trim()).toBe(head)
        expect((await git(repo, 'rev-list', '--count', 'main')).trim()).toBe(
            '1'
        )
        expect((await git(origin, 'rev-parse', 'main')).trim()).toBe(
            origin_head
        )
        expect(
            (await git(repo, 'diff', '--cached', '--name-only')).trim()
        ).toBe('')
        // The de-hooked settings are a change left for the user to commit.
        expect(await git(repo, 'status', '--porcelain')).toContain(
            '.claude/settings.json'
        )
        const to_commit = lines()
            .filter((line) => /commit/i.test(line))
            .join('\n')
        expect(to_commit).toContain('.claude/settings.json')
        expect(to_commit).toContain('.luca/config.json')
    }, 60_000)
})

/** The migration guide, at the repo root's `docs/`. */
const MIGRATION_GUIDE = join(
    import.meta.dir,
    '..',
    '..',
    '..',
    '..',
    'docs',
    'migrating-to-v14.md'
)

describe('v13 migration guide', () => {
    test('docs/migrating-to-v14.md says what is gone, what replaced it, luca doctor --fix, and one global luca', async () => {
        expect(await Bun.file(MIGRATION_GUIDE).exists()).toBe(true)
        const guide = await Bun.file(MIGRATION_GUIDE).text()

        // What's gone.
        expect(guide).toMatch(/\/lu\b/)
        expect(guide).toContain('/luca-init')
        expect(guide).toMatch(/skills/i)
        expect(guide).toMatch(/agents/i)
        expect(guide).toMatch(/commands/i)
        expect(guide).toMatch(/hooks?\b/i)
        expect(guide).toContain('luca vault:init')
        expect(guide).toMatch(/status ?line/i)
        expect(guide).toMatch(/antigravity/i)
        // What replaced it.
        expect(guide).toMatch(/matt pocock/i)
        expect(guide).toContain('/luca-run')
        // The cleanup.
        expect(guide).toContain('luca doctor --fix')
        // One computer, one global luca.
        expect(guide).toMatch(/one global `?luca/i)
    })

    test('doctor links the migration guide when it finds v13 leftovers', async () => {
        await seedHomeV13()

        await doctor({
            fakes: healthy(),
            v13_manifest: await manifestWithStandIns(),
        })

        expect(printed()).toContain('docs/migrating-to-v14.md')
    })
})
