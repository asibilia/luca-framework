import { realpathSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import {
    checksFor,
    ok,
    problem,
    versionAtLeast,
    warning,
    type DoctorCheck,
    type Found,
} from './doctor-checks'
import type { ClaudeMcp, McpServer, MuninnCli, PaseoPlugins } from './init'

import { READY_LABEL } from '../tracker/tracker'

/**
 * `luca doctor`'s checks of this computer, read-only: Bun, the `luca`
 * copies on the PATH, Claude Code, the `gh` login, Paseo and its plugins,
 * the board, MuninnDB and Claude Code's `muninn` entry, and the planning
 * skills. `luca init` ends with them too. The token is never shown.
 */

/** Luca's npm package. */
export const LUCA_PACKAGE = '@alecsibilia/luca'

/** Where MuninnDB serves MCP. */
export const MUNINN_MCP_URL = 'http://127.0.0.1:8750/mcp'

/** MuninnDB's health endpoint. */
export const MUNINN_HEALTH_URL = 'http://127.0.0.1:8475/api/health'

/** The name of Claude Code's MuninnDB entry, the one the engine reads. */
export const MUNINN_SERVER_NAME = 'muninn'

/** The board plugin's id in Paseo. */
export const BOARD_PLUGIN_ID = 'luca-board'

/** The oldest tool versions Luca works with. */
const MIN_CLAUDE_CODE = '2.1.280'
const MIN_PASEO = '0.9.1'
const MIN_MUNINNDB = '0.11.0'

/** One `luca` on the PATH, and the package it belongs to when known. */
export type LucaCopy = {
    path: string
    package_name: string | null
    version: string | null
}

/** The computer's tools, as doctor reads them. */
export type Computer = {
    /** Bun's version, or `null` when it isn't installed. */
    bunVersion: () => Promise<string | null>
    /** Claude Code's version, or `null` when it isn't installed. */
    claudeVersion: () => Promise<string | null>
    /** The login `gh` is signed in as, or `null`. */
    ghLogin: () => Promise<string | null>
    /** Every `luca` on the PATH, in PATH order. */
    lucaCopies: () => Promise<LucaCopy[]>
}

/** MuninnDB's health endpoint: its version while it runs, else `null`. */
export type MuninnHealth = () => Promise<{ version: string } | null>

/** Paseo: its plugins, its version, and the loaded board's Luca version. */
export type Paseo = PaseoPlugins & {
    /** Paseo's version. Fails when Paseo isn't running. */
    version: () => Promise<string>
    /** The Luca version the loaded board reports; `null` with no board. */
    boardVersion: () => Promise<string | null>
}

/** The user-scope entry `luca init` leaves in Claude Code. Pure. */
export const rightEntry = ({ token }: { token: string }): McpServer => ({
    name: MUNINN_SERVER_NAME,
    scope: 'user',
    transport: 'http',
    url: MUNINN_MCP_URL,
    headers: { Authorization: `Bearer ${token}` },
})

/** Whether a server is the right entry, name and scope aside. Pure. */
export const isRight = ({
    server,
    right,
}: {
    server: McpServer
    right: McpServer
}): boolean =>
    server.transport === right.transport &&
    server.url === right.url &&
    server.headers.Authorization === right.headers.Authorization

/** Claude Code's user-scope `muninn` entry, if any. */
export const userMuninnEntry = async ({
    claude,
}: {
    claude: ClaudeMcp
}): Promise<McpServer | undefined> =>
    (await claude.listMcpServers()).find(
        ({ name, scope }) => name === MUNINN_SERVER_NAME && scope === 'user'
    )

/** A path's real path, or the path as is when it can't be resolved. */
export const realPath = (path: string): string => {
    try {
        return realpathSync(path)
    } catch {
        return resolve(path)
    }
}

const describeCopy = ({ path, package_name, version }: LucaCopy): string =>
    package_name === null
        ? `an unknown luca at ${path}`
        : `${package_name}@${version ?? '?'} at ${path}`

/** How to remove one `luca` copy, found by its path. Pure. */
const removal = ({ path, package_name }: LucaCopy): string => {
    if (package_name === null) return `remove ${path} by hand`
    if (path.includes('/.bun/bin/')) return `bun remove -g ${package_name}`
    return `npm uninstall -g --prefix ${dirname(dirname(path))} ${package_name}`
}

const isV14 = ({ package_name, version }: LucaCopy): boolean =>
    package_name === LUCA_PACKAGE && /^14\./.test(version ?? '')

const checkLuca = async ({ computer }: { computer: Computer }) => {
    const copies = await computer.lucaCopies()
    const kept = copies.find(isV14)
    const others = copies.filter((copy) => copy !== kept)
    if (kept === undefined) {
        const install = `bun add -g ${LUCA_PACKAGE}@alpha`
        // `bun add -g` replaces a Luca that Bun installed.
        const removals = others
            .filter(
                (copy) =>
                    !(
                        copy.package_name === LUCA_PACKAGE &&
                        copy.path.includes('/.bun/bin/')
                    )
            )
            .map(removal)
        return problem(
            copies.length === 0
                ? 'No luca on the PATH.'
                : `No v14 luca on the PATH, only ${others.map(describeCopy).join(', ')}.`,
            [...removals, install].join(', then ')
        )
    }
    if (others.length > 0) {
        return problem(
            `Other luca copies are on the PATH besides ${describeCopy(kept)}: ${others.map(describeCopy).join(', ')}.`,
            `Remove them: ${others.map(removal).join(', then ')}.`
        )
    }
    return ok(`luca ${kept.version ?? ''} is the only luca on the PATH`)
}

const checkBun = async ({ computer }: { computer: Computer }) => {
    const version = await computer.bunVersion()
    return version === null
        ? problem(
              "Bun isn't installed.",
              'Install it: curl -fsSL https://bun.sh/install | bash'
          )
        : ok(`Bun ${version}`)
}

const checkClaudeCode = async ({ computer }: { computer: Computer }) => {
    const version = await computer.claudeVersion()
    if (version === null) {
        return problem(
            "Claude Code isn't installed.",
            'Install it: curl -fsSL https://claude.ai/install.sh | bash'
        )
    }
    if (!versionAtLeast({ version, min: MIN_CLAUDE_CODE })) {
        return problem(
            `Claude Code ${version} is older than ${MIN_CLAUDE_CODE}.`,
            'Run claude update'
        )
    }
    return ok(`Claude Code ${version}`)
}

const checkGhLogin = async ({ computer }: { computer: Computer }) => {
    const login = await computer.ghLogin()
    return login === null
        ? problem(
              "gh isn't signed in.",
              'Run gh auth login (install gh first with brew install gh if it is missing)'
          )
        : ok(`gh is signed in as ${login}`)
}

const PASEO_DOWN_FIX = 'Open the Paseo desktop app, then run luca doctor again.'

const checkPaseo = async ({ paseo }: { paseo: Paseo }) => {
    let version: string
    try {
        version = await paseo.version()
    } catch (error) {
        return problem(
            `Paseo isn't running, or can't be reached (${error instanceof Error ? error.message : String(error)}).`,
            PASEO_DOWN_FIX
        )
    }
    if (!versionAtLeast({ version, min: MIN_PASEO })) {
        return problem(
            `Paseo ${version} is older than ${MIN_PASEO}.`,
            `Update Paseo to ${MIN_PASEO} or newer (Paseo's menu, Check for Updates).`
        )
    }
    return ok(`Paseo ${version}`)
}

const checkPaseoPlugins = async ({ paseo }: { paseo: Paseo }) =>
    (await paseo.pluginsEnabled())
        ? ok("Paseo's plugins are on")
        : problem(
              "Paseo's plugins are off.",
              "Turn plugins on in Paseo's Settings, then run luca doctor --fix."
          )

const checkBoard = async ({
    paseo,
    luca_version,
    board_dir,
    engine_path,
    bun_path,
}: {
    paseo: Paseo
    luca_version: string
    board_dir: string
    engine_path: string
    bun_path: string
}) => {
    const board = (await paseo.listPlugins()).find(
        ({ id }) => id === BOARD_PLUGIN_ID
    )
    if (board === undefined) {
        return problem(
            "The board isn't installed in Paseo.",
            "Run luca doctor --fix (or luca init) to install it from Luca's folder."
        )
    }
    if (realPath(board.path) !== realPath(board_dir)) {
        return problem(
            `The board is installed from ${board.path}, not from Luca's folder ${board_dir}.`,
            "Run luca doctor --fix to move it to Luca's folder, keeping its settings."
        )
    }
    const loaded = await paseo.boardVersion()
    if (loaded !== luca_version) {
        return problem(
            `The board loaded in Paseo is ${loaded ?? 'of an unknown version'}, but the installed Luca is ${luca_version}.`,
            'Run luca doctor --fix to reload it.'
        )
    }
    const settings = await paseo.readSettings({ plugin_id: BOARD_PLUGIN_ID })
    const wrong = [
        ['engine path', settings.engine_path, engine_path],
        ['Bun path', settings.bun_path, bun_path],
    ].filter(
        ([, have, want]) =>
            typeof have !== 'string' ||
            realPath(have) !== realPath(String(want))
    )
    if (wrong.length > 0) {
        return problem(
            `The board's ${wrong.map(([what, have, want]) => `${what} is ${typeof have === 'string' ? have : 'not set'}, not ${want}`).join(', and its ')}.`,
            "Run luca doctor --fix to rewrite the board's paths."
        )
    }
    return ok(
        `The board ${luca_version} is installed from ${board_dir}, and its engine and Bun paths are right`
    )
}

const MEMORY_OFF_FIX =
    'Run luca init to set up MuninnDB and turn memory on, or leave memory off.'

const checkMuninnDb = async ({
    muninn,
    muninn_health,
}: {
    muninn: MuninnCli
    muninn_health: MuninnHealth
}) => {
    if ((await muninn.which()) === null) {
        return warning("MuninnDB isn't installed: memory off.", MEMORY_OFF_FIX)
    }
    const health = await muninn_health()
    if (health === null) {
        return problem(
            `MuninnDB isn't answering at ${MUNINN_HEALTH_URL}.`,
            'Run muninn start (or luca doctor --fix).'
        )
    }
    if (!versionAtLeast({ version: health.version, min: MIN_MUNINNDB })) {
        return problem(
            `MuninnDB ${health.version} is older than ${MIN_MUNINNDB}.`,
            'Run muninn upgrade'
        )
    }
    return ok(`MuninnDB ${health.version} is up`)
}

const checkMuninnEntry = async ({
    muninn,
    claude,
}: {
    muninn: MuninnCli
    claude: ClaudeMcp
}) => {
    if ((await muninn.which()) === null) {
        return warning(
            "MuninnDB isn't installed, so there's no muninn entry to check: memory off.",
            MEMORY_OFF_FIX
        )
    }
    const token = await muninn.token()
    if (token === null || token === '') {
        return problem(
            "MuninnDB has no token file, so Claude Code's muninn entry can't be checked.",
            'Run muninn init --yes, then luca doctor --fix.'
        )
    }
    const current = await userMuninnEntry({ claude })
    if (current === undefined) {
        return problem(
            'Claude Code has no user-scope muninn entry.',
            'Run luca doctor --fix (or luca init) to add it.'
        )
    }
    if (!isRight({ server: current, right: rightEntry({ token }) })) {
        return problem(
            `Claude Code's user-scope muninn entry doesn't match MuninnDB (it needs HTTP to ${MUNINN_MCP_URL} with MuninnDB's token).`,
            'Run luca doctor --fix (or luca init) to replace it.'
        )
    }
    return ok(
        "Claude Code has the user-scope muninn entry with MuninnDB's token"
    )
}

/** What each planning skill must still write for intake to accept it. */
const PLANNING_SKILL_NEEDS: [skill: string, needs: string[]][] = [
    ['to-spec', ['Testing Decisions']],
    ['to-tickets', ['What to build', 'Acceptance criteria', READY_LABEL]],
]

/** An installed skill's text, from the user's global skill folders. */
const skillText = async ({
    home,
    skill,
}: {
    home: string
    skill: string
}): Promise<string | null> => {
    for (const folder of [
        join(home, '.claude', 'skills'),
        join(home, '.agents', 'skills'),
    ]) {
        const file = Bun.file(join(folder, skill, 'SKILL.md'))
        if (await file.exists()) return file.text()
    }
    return null
}

const checkPlanningSkills = async ({ home }: { home: string }) => {
    const drift: string[] = []
    for (const [skill, needs] of PLANNING_SKILL_NEEDS) {
        const text = await skillText({ home, skill })
        if (text === null) {
            drift.push(`${skill} isn't installed`)
            continue
        }
        const missing = needs.filter((need) => !text.includes(need))
        if (missing.length > 0) {
            drift.push(
                `${skill} no longer writes ${missing.map((need) => `"${need}"`).join(', ')}`
            )
        }
    }
    if (drift.length > 0) {
        return warning(
            `The planning skills no longer write what intake needs: ${drift.join('; ')}.`,
            `Intake refuses specs and tickets without these. Run luca init to install missing skills, or edit the installed ones so they write them again.`
        )
    }
    return ok('The planning skills write what intake needs')
}

/**
 * Runs the computer checks, in order, read-only. Never throws: a check that
 * fails becomes a problem.
 *
 * @example
 * const checks = await computerChecks({ home, luca_version, board_dir, engine_path, bun_path, computer, muninn, muninn_health, claude, paseo })
 */
export const computerChecks = async ({
    home,
    luca_version,
    board_dir,
    engine_path,
    bun_path,
    computer,
    muninn,
    muninn_health,
    claude,
    paseo,
}: {
    home: string
    /** The installed Luca's version. */
    luca_version: string
    board_dir: string
    engine_path: string
    bun_path: string
    computer: Computer
    muninn: MuninnCli
    muninn_health: MuninnHealth
    claude: ClaudeMcp
    paseo: Paseo
}): Promise<DoctorCheck[]> => {
    // With Paseo down, its plugins and the board aren't asked about.
    let paseo_up = true
    const withPaseo =
        (run: () => Promise<Found>) => async (): Promise<Found> =>
            paseo_up
                ? run()
                : problem(
                      "Paseo isn't running, so this wasn't checked.",
                      PASEO_DOWN_FIX
                  )
    return checksFor({
        group: 'computer',
        checks: [
            ['bun', () => checkBun({ computer })],
            ['luca', () => checkLuca({ computer })],
            ['claude_code', () => checkClaudeCode({ computer })],
            ['gh_login', () => checkGhLogin({ computer })],
            [
                'paseo',
                async () => {
                    const found = await checkPaseo({ paseo })
                    paseo_up = found.fix !== PASEO_DOWN_FIX
                    return found
                },
            ],
            ['paseo_plugins', withPaseo(() => checkPaseoPlugins({ paseo }))],
            [
                'board',
                withPaseo(() =>
                    checkBoard({
                        paseo,
                        luca_version,
                        board_dir,
                        engine_path,
                        bun_path,
                    })
                ),
            ],
            ['muninndb', () => checkMuninnDb({ muninn, muninn_health })],
            ['muninn_entry', () => checkMuninnEntry({ muninn, claude })],
            ['planning_skills', () => checkPlanningSkills({ home })],
        ],
    })
}
