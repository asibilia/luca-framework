import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import { setUpBoard, type StepEnd } from './board-in-paseo'
import type {
    Ask,
    ClaudeMcp,
    Computer,
    LucaInstall,
    MuninnCli,
    MuninnHealth,
    Paseo,
} from './computer-adapters'
import { computerChecks } from './computer-checks'
import {
    formatChecks,
    hasProblem,
    reason,
    type DoctorCheck,
} from './doctor-checks'
import { ensureMuninnEntry, hideToken } from './muninn-entry'

/**
 * `luca init`: sets up this computer for Luca, once, and is safe to run
 * again. It has three parts, each run even when an earlier one failed, and
 * ends with doctor's computer checks.
 *
 * Memory:
 *
 * 1. installs MuninnDB when it isn't there;
 * 2. runs `muninn init --yes` (never the `--tool claude-code` form, which
 *    adds a block to the user's `~/.claude/CLAUDE.md`);
 * 3. makes sure Claude Code has a user-scope `muninn` MCP server over HTTP
 *    whose `Authorization` header holds the literal token from MuninnDB's
 *    token file, as the engine reads only that entry: a right one is left
 *    alone, a wrong one is removed, then added (see `ensureMuninnEntry`);
 * 4. writes and loads a login item, a LaunchAgent that runs `muninn start`
 *    once at login, with no KeepAlive (it would fight `muninn stop` and
 *    `muninn upgrade`).
 *
 * `skip_muninndb` skips all of it: runs then have memory off.
 *
 * The board: installs the `luca-board` plugin into Paseo from Luca's own
 * install folder and writes its engine and Bun paths, asking before it
 * turns Paseo's plugins on (see `setUpBoard`).
 *
 * The planning skills: installs the ones Luca's intake expects from
 * `mattpocock/skills` with the `skills` tool, skipping any already there.
 * `skip_skills` skips this part.
 *
 * MuninnDB's CLI, `claude mcp`, `launchctl`, Paseo, the question to the
 * user, the `skills` tool, and the computer's tools are adapters, so tests
 * use fakes. The token is never printed, returned, or thrown.
 */

/** The login item's launchd label, and its file name without `.plist`. */
export const LOGIN_ITEM_LABEL = 'com.alecsibilia.luca.muninn'

/** macOS's `launchctl`, for the login item. */
export type Launchctl = {
    /** Whether a job with this label is loaded. */
    loaded: (args: { label: string }) => Promise<boolean>
    /** Loads the job in this plist file. */
    load: (args: { plist: string }) => Promise<void>
}

/** The `skills` tool, for the user's global skills. */
export type SkillsTool = {
    /** The names of the skills installed now. */
    installedSkills: () => Promise<string[]>
    installSkills: (args: { source: string; skills: string[] }) => Promise<void>
}

/**
 * How init ended: `ok` when every step worked and no check is a problem;
 * `message` is the last line of its own steps; `doctor` holds the computer
 * checks it ended with.
 */
export type InitEnd = {
    ok: boolean
    memory: 'on' | 'off'
    message: string
    doctor: DoctorCheck[]
}

/** The note printed when MuninnDB is skipped. */
export const MEMORY_OFF_NOTE =
    'Skipped MuninnDB (--skip-muninndb): runs will have memory off.'

/** Where the planning skills come from, for the `skills` tool. */
export const PLANNING_SKILLS_SOURCE = 'mattpocock/skills'

/** The planning skills Luca's intake expects. */
export const PLANNING_SKILLS = [
    'to-spec',
    'to-tickets',
    'setup-matt-pocock-skills',
    'grilling',
    'domain-modeling',
]

/** The note printed when the planning skills are skipped. */
export const SKILLS_SKIPPED_NOTE =
    'Skipped the planning skills (--skip-skills).'

/**
 * The login item: runs `muninn start` once at login. No KeepAlive. Pure.
 *
 * @example
 * loginItemPlist({ muninn: '/Users/me/.local/bin/muninn' }) // '<?xml ...'
 */
export const loginItemPlist = ({ muninn }: { muninn: string }): string => {
    const escape = (text: string) =>
        text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LOGIN_ITEM_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${escape(muninn)}</string>
        <string>start</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
`
}

/** Installs the planning skills that aren't there yet. Never throws. */
const setUpSkills = async ({
    skills,
    log,
}: {
    skills: SkillsTool
    log: (line: string) => void
}): Promise<StepEnd> => {
    const say = ({ message, ok }: StepEnd): StepEnd => {
        log(message)
        return { ok, message }
    }
    try {
        const have = new Set(await skills.installedSkills())
        const missing = PLANNING_SKILLS.filter((skill) => !have.has(skill))
        if (missing.length === 0) {
            return say({
                message: '[luca init] Planning skills: all installed',
                ok: true,
            })
        }
        await skills.installSkills({
            source: PLANNING_SKILLS_SOURCE,
            skills: missing,
        })
        return say({
            message: `[luca init] Planning skills: installed ${missing.join(', ')} from ${PLANNING_SKILLS_SOURCE}`,
            ok: true,
        })
    } catch (error) {
        return say({
            message: `[luca init] Planning skills: ${reason(error)}`,
            ok: false,
        })
    }
}

/** Runs init's memory part. Never throws, and never shows the token. */
const setUpMemory = async ({
    home,
    skip_muninndb,
    muninn,
    claude,
    launchctl,
    log,
}: {
    home: string
    skip_muninndb: boolean
    muninn: MuninnCli
    claude: ClaudeMcp
    launchctl: Launchctl
    log: (line: string) => void
}): Promise<Omit<InitEnd, 'doctor'>> => {
    if (skip_muninndb) {
        log(`[luca init] ${MEMORY_OFF_NOTE}`)
        return { ok: true, memory: 'off', message: MEMORY_OFF_NOTE }
    }
    let token: string | null = null
    try {
        let bin = await muninn.which()
        if (bin === null) {
            log('[luca init] MuninnDB: installing')
            await muninn.install()
            bin = await muninn.which()
            if (bin === null) {
                throw new Error(
                    'MuninnDB was installed, but no muninn binary was found. Put it on your PATH and run luca init again.'
                )
            }
        }
        log(`[luca init] MuninnDB: installed at ${bin}`)

        const initialized = await muninn.run({ args: ['init', '--yes'] })
        if (initialized.exit_code !== 0) {
            throw new Error(
                `muninn init --yes failed (exit ${initialized.exit_code}): ${initialized.stderr.trim()}`
            )
        }
        log('[luca init] MuninnDB: initialized')

        token = await muninn.token()
        if (token === null || token === '') {
            throw new Error(
                "MuninnDB's token file is missing after muninn init. Run muninn init --yes, then luca init again."
            )
        }
        await ensureMuninnEntry({
            claude,
            token,
            prefix: '[luca init]',
            log,
        })

        const folder = join(home, 'Library', 'LaunchAgents')
        const plist = join(folder, `${LOGIN_ITEM_LABEL}.plist`)
        const text = loginItemPlist({ muninn: bin })
        const file = Bun.file(plist)
        if ((await file.exists()) && (await file.text()) === text) {
            log(`[luca init] Login item: ${plist} is right`)
        } else {
            await mkdir(folder, { recursive: true })
            await Bun.write(plist, text)
            log(`[luca init] Login item: wrote ${plist}`)
        }
        if (await launchctl.loaded({ label: LOGIN_ITEM_LABEL })) {
            log('[luca init] Login item: loaded')
        } else {
            await launchctl.load({ plist })
            log('[luca init] Login item: loaded now')
        }
    } catch (error) {
        const message = hideToken({
            text: `[luca init] ${reason(error)}`,
            token,
        })
        log(message)
        return { ok: false, memory: 'off', message }
    }
    const message = '[luca init] MuninnDB is set up: runs will have memory.'
    log(message)
    return { ok: true, memory: 'on', message }
}

/**
 * Runs `luca init` against `home` with these adapters: memory, then the
 * board, then the planning skills, then doctor's computer checks, printed
 * last. Never throws: a failure is logged (token hidden) and ends with
 * `ok: false`, as does a check that is a problem.
 *
 * @example
 * const end = await runInit({ home: homedir(), skip_muninndb: false, skip_skills: false, muninn, muninn_health, claude, launchctl, paseo, skills, ask, computer, ...(await lucaInstall()), log: console.log })
 */
export const runInit = async ({
    home,
    skip_muninndb,
    skip_skills,
    muninn,
    muninn_health,
    claude,
    launchctl,
    paseo,
    skills,
    ask,
    computer,
    luca_version,
    board_dir,
    engine_path,
    bun_path,
    log,
}: LucaInstall & {
    home: string
    skip_muninndb: boolean
    skip_skills: boolean
    muninn: MuninnCli
    muninn_health: MuninnHealth
    claude: ClaudeMcp
    launchctl: Launchctl
    paseo: Paseo
    skills: SkillsTool
    ask: Ask
    computer: Computer
    log: (line: string) => void
}): Promise<InitEnd> => {
    const memory = await setUpMemory({
        home,
        skip_muninndb,
        muninn,
        claude,
        launchctl,
        log,
    })
    const board = await setUpBoard({
        paseo,
        ask,
        board_dir,
        engine_path,
        bun_path,
        log,
    })
    let planning: StepEnd
    if (skip_skills) {
        const message = `[luca init] ${SKILLS_SKIPPED_NOTE}`
        log(message)
        planning = { ok: true, message }
    } else {
        planning = await setUpSkills({ skills, log })
    }
    const doctor = await computerChecks({
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
    })
    for (const line of formatChecks({ checks: doctor })) log(line)
    return {
        ok:
            memory.ok &&
            board.ok &&
            planning.ok &&
            !hasProblem({ checks: doctor }),
        memory: memory.memory,
        message: planning.message,
        doctor,
    }
}
