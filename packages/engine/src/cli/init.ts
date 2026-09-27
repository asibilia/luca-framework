import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
    BOARD_PLUGIN_ID,
    computerChecks,
    isRight,
    MUNINN_SERVER_NAME,
    realPath,
    rightEntry,
    userMuninnEntry,
    type Computer,
    type MuninnHealth,
    type Paseo,
} from './computer-checks'
import { formatChecks, hasProblem, type DoctorCheck } from './doctor-checks'

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
 *    alone, a wrong one is removed, then added;
 * 4. writes and loads a login item, a LaunchAgent that runs `muninn start`
 *    once at login, with no KeepAlive (it would fight `muninn stop` and
 *    `muninn upgrade`).
 *
 * `skip_muninndb` skips all of it: runs then have memory off.
 *
 * The board: installs the `luca-board` plugin into Paseo as a folder source,
 * the board folder inside Luca's own install folder, so the board and the
 * engine are always the same version. When the board is already installed
 * from that folder, it is reloaded; from another folder (such as the old
 * pinned clone), its settings are read, it is removed and installed again,
 * and they are written back, as removing a plugin wipes its settings and
 * installing over an id fails. Then the board's engine and Bun paths are
 * written. When Paseo's plugins are off, the user is asked before they are
 * turned on; on no, nothing in Paseo changes.
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

/** MuninnDB's CLI. */
export type MuninnCli = {
    /** The `muninn` binary's path, or `null` when it isn't installed. */
    which: () => Promise<string | null>
    /** Downloads and installs MuninnDB. */
    install: () => Promise<void>
    /** Runs `muninn <args>`. */
    run: (args: {
        args: string[]
    }) => Promise<{ exit_code: number | null; stdout: string; stderr: string }>
    /** The token in MuninnDB's own token file, or `null` when there is none. */
    token: () => Promise<string | null>
}

/** One of Claude Code's MCP servers. */
export type McpServer = {
    name: string
    scope: 'user' | 'local' | 'project'
    transport: 'http' | 'sse' | 'stdio'
    /** `''` for a stdio server. */
    url: string
    headers: Record<string, string>
}

/** Claude Code's `claude mcp`. */
export type ClaudeMcp = {
    listMcpServers: () => Promise<McpServer[]>
    /** Fails when a server of that name is already in that scope. */
    addMcpServer: (server: McpServer) => Promise<void>
    removeMcpServer: (args: {
        name: string
        scope: McpServer['scope']
    }) => Promise<void>
}

/** macOS's `launchctl`, for the login item. */
export type Launchctl = {
    /** Whether a job with this label is loaded. */
    loaded: (args: { label: string }) => Promise<boolean>
    /** Loads the job in this plist file. */
    load: (args: { plist: string }) => Promise<void>
}

/** A Paseo plugin's settings document, as its settings RPCs hold it. */
export type PluginSettings = Record<string, unknown>

/** Paseo's plugins and their settings. */
export type PaseoPlugins = {
    /** Whether Paseo's plugins are on. */
    pluginsEnabled: () => Promise<boolean>
    /** Turns Paseo's plugins on. Only after the user said yes. */
    enablePlugins: () => Promise<void>
    /** Every installed plugin: its id and the folder it was installed from. */
    listPlugins: () => Promise<{ id: string; path: string }[]>
    /** Installs a folder source. Fails when the id is already installed. */
    installPlugin: (args: { path: string; id: string }) => Promise<void>
    reloadPlugin: (args: { id: string }) => Promise<void>
    /** Removes a plugin, and its settings with it. */
    removePlugin: (args: { id: string }) => Promise<void>
    /** The board's `engine` settings document. */
    readSettings: (args: { plugin_id: string }) => Promise<PluginSettings>
    writeSettings: (args: {
        plugin_id: string
        values: PluginSettings
    }) => Promise<void>
}

/** A yes-or-no question to the user; `true` is yes. */
export type Ask = (args: { question: string }) => Promise<boolean>

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

/** Any text with the token swapped for `***`. Pure. */
export const hideToken = ({
    text,
    token,
}: {
    text: string
    token: string | null
}): string =>
    token === null || token === '' ? text : text.split(token).join('***')

/** Why a step failed, in words. Pure. */
const reason = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/** How one step of init ended; `message` is the last line it printed. */
export type StepEnd = { ok: boolean; message: string }

/**
 * Makes Claude Code's user-scope `muninn` entry the right one for `token`:
 * a right one is left alone, a wrong one is removed, then added. Logs each
 * change after `prefix`, never the token. Throws when `claude mcp` fails.
 */
export const ensureMuninnEntry = async ({
    claude,
    token,
    prefix,
    log,
}: {
    claude: ClaudeMcp
    token: string
    prefix: string
    log: (line: string) => void
}): Promise<void> => {
    const right = rightEntry({ token })
    const current = await userMuninnEntry({ claude })
    if (current !== undefined && isRight({ server: current, right })) {
        log(`${prefix} Claude Code: the user-scope muninn entry is right`)
        return
    }
    if (current !== undefined) {
        await claude.removeMcpServer({
            name: MUNINN_SERVER_NAME,
            scope: 'user',
        })
        log(`${prefix} Claude Code: removed the wrong muninn entry`)
    }
    await claude.addMcpServer(right)
    log(`${prefix} Claude Code: added the user-scope muninn entry`)
}

/**
 * Puts the board into Paseo from `board_dir`, with Paseo's plugins on, and
 * writes its engine and Bun paths, keeping its other settings. When the
 * board is already installed from that folder, it is reloaded; from another
 * folder, its settings are read, it is removed and installed again, and
 * they are written back. Logs each step after `prefix`. Throws when Paseo
 * fails. `installed` says whether the board was installed anew.
 */
export const placeBoard = async ({
    paseo,
    board_dir,
    engine_path,
    bun_path,
    prefix,
    log,
}: {
    paseo: PaseoPlugins
    board_dir: string
    engine_path: string
    bun_path: string
    prefix: string
    log: (line: string) => void
}): Promise<{ installed: boolean }> => {
    const current = (await paseo.listPlugins()).find(
        ({ id }) => id === BOARD_PLUGIN_ID
    )
    let kept: PluginSettings = {}
    let installed = false
    if (current === undefined) {
        await paseo.installPlugin({ path: board_dir, id: BOARD_PLUGIN_ID })
        installed = true
        log(`${prefix} Board: installed from ${board_dir}`)
    } else if (realPath(current.path) === realPath(board_dir)) {
        kept = await paseo.readSettings({ plugin_id: BOARD_PLUGIN_ID })
        await paseo.reloadPlugin({ id: BOARD_PLUGIN_ID })
        log(`${prefix} Board: reloaded from ${board_dir}`)
    } else {
        // Removing wipes the settings, so they are read first.
        kept = await paseo.readSettings({ plugin_id: BOARD_PLUGIN_ID })
        await paseo.removePlugin({ id: BOARD_PLUGIN_ID })
        await paseo.installPlugin({ path: board_dir, id: BOARD_PLUGIN_ID })
        installed = true
        log(
            `${prefix} Board: moved from ${current.path} to ${board_dir}, settings kept`
        )
    }

    await paseo.writeSettings({
        plugin_id: BOARD_PLUGIN_ID,
        values: { ...kept, engine_path, bun_path },
    })
    log(`${prefix} Board: engine path ${engine_path}, Bun path ${bun_path}`)
    return { installed }
}

/**
 * Puts the board into Paseo from `board_dir` (reloaded when it is already
 * installed from there, its settings kept) and writes its engine and Bun
 * paths, asking before it turns Paseo's plugins on. Each line it logs starts
 * with `[<command>]`. Never throws.
 *
 * @example
 * const end = await setUpBoard({ command: 'luca upgrade', paseo, ask, board_dir, engine_path, bun_path, log: console.log })
 */
export const setUpBoard = async ({
    command = 'luca init',
    paseo,
    ask,
    board_dir,
    engine_path,
    bun_path,
    log,
}: {
    /** The command that logs, such as `luca init`. */
    command?: string
    paseo: PaseoPlugins
    ask: Ask
    board_dir: string
    engine_path: string
    bun_path: string
    log: (line: string) => void
}): Promise<StepEnd> => {
    const say = (message: string, ok: boolean): StepEnd => {
        log(message)
        return { ok, message }
    }
    try {
        if (!(await paseo.pluginsEnabled())) {
            const yes = await ask({
                question:
                    "Paseo's plugins are off. Turn them on so Luca can install its board?",
            })
            if (!yes) {
                return say(
                    `[${command}] Board: Paseo's plugins are off, so the board wasn't installed. Turn them on in Paseo's Settings, then run luca init again.`,
                    false
                )
            }
            await paseo.enablePlugins()
            log(`[${command}] Board: turned Paseo's plugins on`)
        }

        const { installed } = await placeBoard({
            paseo,
            board_dir,
            engine_path,
            bun_path,
            prefix: `[${command}]`,
            log,
        })
        return say(
            installed
                ? `[${command}] Board is ready. Run /reload-skills in a Paseo chat so /luca-run shows up.`
                : `[${command}] Board is ready.`,
            true
        )
    } catch (error) {
        return say(`[${command}] Board: ${reason(error)}`, false)
    }
}

/** Installs the planning skills that aren't there yet. Never throws. */
const setUpSkills = async ({
    skills,
    log,
}: {
    skills: SkillsTool
    log: (line: string) => void
}): Promise<StepEnd> => {
    const say = (message: string, ok: boolean): StepEnd => {
        log(message)
        return { ok, message }
    }
    try {
        const have = new Set(await skills.installedSkills())
        const missing = PLANNING_SKILLS.filter((skill) => !have.has(skill))
        if (missing.length === 0) {
            return say('[luca init] Planning skills: all installed', true)
        }
        await skills.installSkills({
            source: PLANNING_SKILLS_SOURCE,
            skills: missing,
        })
        return say(
            `[luca init] Planning skills: installed ${missing.join(', ')} from ${PLANNING_SKILLS_SOURCE}`,
            true
        )
    } catch (error) {
        return say(`[luca init] Planning skills: ${reason(error)}`, false)
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
            text: `[luca init] ${error instanceof Error ? error.message : String(error)}`,
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
 * const end = await runInit({ home: homedir(), skip_muninndb: false, skip_skills: false, muninn, muninn_health, claude, launchctl, paseo, skills, ask, computer, luca_version, board_dir, engine_path, bun_path, log: console.log })
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
}: {
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
    /** The installed Luca's version. */
    luca_version: string
    /** The board folder inside Luca's install folder. */
    board_dir: string
    /** The real path of the installed `luca-run`. */
    engine_path: string
    /** Bun's own path. */
    bun_path: string
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
