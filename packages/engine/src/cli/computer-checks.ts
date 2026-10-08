import { dirname, join } from 'node:path'

import { realPath } from './board-in-paseo'
import {
    BOARD_PLUGIN_ID,
    MUNINN_HEALTH_URL,
    MUNINN_MCP_URL,
    type ClaudeMcp,
    type Computer,
    type LucaCopy,
    type MuninnCli,
    type MuninnHealth,
    type Paseo,
} from './computer-adapters'
import {
    checksFor,
    ok,
    problem,
    reason,
    versionAtLeast,
    warning,
    type DoctorCheck,
    type Found,
} from './doctor-checks'
import { claudeSkillsDir, skillDrift } from './luca-skills'
import { isRight, rightEntry, userMuninnEntry } from './muninn-entry'

import { LUCA_PACKAGE } from '../config/luca-version'
import { READY_LABEL } from '../tracker/tracker'

/**
 * `luca doctor`'s checks of this computer, read-only: Bun, the `luca`
 * copies on the PATH, Claude Code, the `gh` login, Paseo and its plugins,
 * the board, MuninnDB and Claude Code's `muninn` entry, the planning
 * skills, and Luca's own skills. `luca init` and `luca upgrade` end with them too. The token is
 * never shown.
 */

/** The oldest tool versions Luca works with. */
const MIN_CLAUDE_CODE = '2.1.280'
const MIN_PASEO = '0.9.1'
const MIN_MUNINNDB = '0.11.0'

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
        return problem({
            detail:
                copies.length === 0
                    ? 'No luca on the PATH.'
                    : `No v14 luca on the PATH, only ${others.map(describeCopy).join(', ')}.`,
            fix: [...removals, install].join(', then '),
        })
    }
    if (others.length > 0) {
        return problem({
            detail: `Other luca copies are on the PATH besides ${describeCopy(kept)}: ${others.map(describeCopy).join(', ')}.`,
            fix: `Remove them: ${others.map(removal).join(', then ')}.`,
        })
    }
    return ok(`luca ${kept.version ?? ''} is the only luca on the PATH`)
}

const checkBun = async ({ computer }: { computer: Computer }) => {
    const version = await computer.bunVersion()
    return version === null
        ? problem({
              detail: "Bun isn't installed.",
              fix: 'Install it: curl -fsSL https://bun.sh/install | bash',
          })
        : ok(`Bun ${version}`)
}

const checkClaudeCode = async ({ computer }: { computer: Computer }) => {
    const version = await computer.claudeVersion()
    if (version === null) {
        return problem({
            detail: "Claude Code isn't installed.",
            fix: 'Install it: curl -fsSL https://claude.ai/install.sh | bash',
        })
    }
    if (!versionAtLeast({ version, min: MIN_CLAUDE_CODE })) {
        return problem({
            detail: `Claude Code ${version} is older than ${MIN_CLAUDE_CODE}.`,
            fix: 'Run claude update',
        })
    }
    return ok(`Claude Code ${version}`)
}

const checkGhLogin = async ({ computer }: { computer: Computer }) => {
    const login = await computer.ghLogin()
    return login === null
        ? problem({
              detail: "gh isn't signed in.",
              fix: 'Run gh auth login (install gh first with brew install gh if it is missing)',
          })
        : ok(`gh is signed in as ${login}`)
}

const PASEO_DOWN_FIX = 'Open the Paseo desktop app, then run luca doctor again.'

const checkPaseo = async ({ paseo }: { paseo: Paseo }) => {
    let version: string
    try {
        version = await paseo.version()
    } catch (error) {
        return problem({
            detail: `Paseo isn't running, or can't be reached (${reason(error)}).`,
            fix: PASEO_DOWN_FIX,
        })
    }
    if (!versionAtLeast({ version, min: MIN_PASEO })) {
        return problem({
            detail: `Paseo ${version} is older than ${MIN_PASEO}.`,
            fix: `Update Paseo to ${MIN_PASEO} or newer (Paseo's menu, Check for Updates).`,
        })
    }
    return ok(`Paseo ${version}`)
}

const checkPaseoPlugins = async ({ paseo }: { paseo: Paseo }) =>
    (await paseo.pluginsEnabled())
        ? ok("Paseo's plugins are on")
        : problem({
              detail: "Paseo's plugins are off.",
              fix: "Turn plugins on in Paseo's Settings, then run luca doctor --fix.",
          })

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
        return problem({
            detail: "The board isn't installed in Paseo.",
            fix: "Run luca doctor --fix (or luca init) to install it from Luca's folder.",
        })
    }
    if (realPath(board.path) !== realPath(board_dir)) {
        return problem({
            detail: `The board is installed from ${board.path}, not from Luca's folder ${board_dir}.`,
            fix: "Run luca doctor --fix to move it to Luca's folder, keeping its settings.",
        })
    }
    const loaded = await paseo.boardVersion()
    if (loaded !== luca_version) {
        return problem({
            detail: `The board loaded in Paseo is ${loaded ?? 'of an unknown version'}, but the installed Luca is ${luca_version}.`,
            fix: 'Run luca doctor --fix to reload it.',
        })
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
        return problem({
            detail: `The board's ${wrong.map(([what, have, want]) => `${what} is ${typeof have === 'string' ? have : 'not set'}, not ${want}`).join(', and its ')}.`,
            fix: "Run luca doctor --fix to rewrite the board's paths.",
        })
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
        return warning({
            detail: "MuninnDB isn't installed: memory off.",
            fix: MEMORY_OFF_FIX,
        })
    }
    const health = await muninn_health()
    if (health === null) {
        return problem({
            detail: `MuninnDB isn't answering at ${MUNINN_HEALTH_URL}.`,
            fix: 'Run muninn start (or luca doctor --fix).',
        })
    }
    if (!versionAtLeast({ version: health.version, min: MIN_MUNINNDB })) {
        return problem({
            detail: `MuninnDB ${health.version} is older than ${MIN_MUNINNDB}.`,
            fix: 'Run muninn upgrade',
        })
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
        return warning({
            detail: "MuninnDB isn't installed, so there's no muninn entry to check: memory off.",
            fix: MEMORY_OFF_FIX,
        })
    }
    const token = await muninn.token()
    if (token === null || token === '') {
        return problem({
            detail: "MuninnDB has no token file, so Claude Code's muninn entry can't be checked.",
            fix: 'Run muninn init --yes, then luca doctor --fix.',
        })
    }
    const current = await userMuninnEntry({ claude })
    if (current === undefined) {
        return problem({
            detail: 'Claude Code has no user-scope muninn entry.',
            fix: 'Run luca doctor --fix (or luca init) to add it.',
        })
    }
    if (!isRight({ server: current, right: rightEntry({ token }) })) {
        return problem({
            detail: `Claude Code's user-scope muninn entry doesn't match MuninnDB (it needs HTTP to ${MUNINN_MCP_URL} with MuninnDB's token).`,
            fix: 'Run luca doctor --fix (or luca init) to replace it.',
        })
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
        return warning({
            detail: `The planning skills no longer write what intake needs: ${drift.join('; ')}.`,
            fix: `Intake refuses specs and tickets without these. Run luca init to install missing skills, or edit the installed ones so they write them again.`,
        })
    }
    return ok('The planning skills write what intake needs')
}

/**
 * Luca's own skills (#504): each one in the installed Luca's skills folder
 * (#529) is in `~/.claude/skills`, and its files are the ones it ships.
 */
const checkLucaSkills = async ({
    home,
    skills_dir,
    luca_version,
}: {
    home: string
    skills_dir: string
    luca_version: string
}) => {
    const drift = await skillDrift({ home, skills_dir })
    if (drift.length === 0) {
        return problem({
            detail: `Luca's folder ${skills_dir} has no skills.`,
            fix: `Reinstall Luca: bun add -g ${LUCA_PACKAGE}@alpha`,
        })
    }
    const off = drift.filter(
        ({ missing, changed }) => missing.length + changed.length > 0
    )
    if (off.length > 0) {
        const described = off.map(({ skill, missing }) =>
            missing.includes('SKILL.md')
                ? `/${skill} isn't installed`
                : `/${skill} isn't the one Luca ${luca_version} ships`
        )
        return problem({
            detail: `In ${claudeSkillsDir({ home })}, ${described.join('; ')}.`,
            fix: 'Run luca doctor --fix (or luca init) to install it.',
        })
    }
    return ok(
        `Luca's skills (${drift.map(({ skill }) => `/${skill}`).join(', ')}) match Luca ${luca_version}`
    )
}

/**
 * Runs the computer checks, in order, read-only. Never throws: a check that
 * fails becomes a problem.
 *
 * @example
 * const checks = await computerChecks({ home, luca_version, board_dir, skills_dir, engine_path, bun_path, computer, muninn, muninn_health, claude, paseo })
 */
export const computerChecks = async ({
    home,
    luca_version,
    board_dir,
    skills_dir,
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
    /** The skills folder inside Luca's install folder. */
    skills_dir: string
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
                : problem({
                      detail: "Paseo isn't running, so this wasn't checked.",
                      fix: PASEO_DOWN_FIX,
                  })
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
            [
                'luca_skills',
                () => checkLucaSkills({ home, skills_dir, luca_version }),
            ],
        ],
    })
}
