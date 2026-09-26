import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * `luca init`: sets up this computer for Luca, once, and is safe to run
 * again. This part is memory:
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
 * `skip_muninndb` skips all of it: runs then have memory off. MuninnDB's
 * CLI, `claude mcp`, and `launchctl` are adapters, so tests use fakes. The
 * token is never printed, returned, or thrown.
 */

/** Where MuninnDB serves MCP. */
export const MUNINN_MCP_URL = 'http://127.0.0.1:8750/mcp'

/** The name of Claude Code's MuninnDB entry, the one the engine reads. */
export const MUNINN_SERVER_NAME = 'muninn'

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

/** How init ended; `message` is the last line it printed. */
export type InitEnd = { ok: boolean; memory: 'on' | 'off'; message: string }

/** The note printed when MuninnDB is skipped. */
export const MEMORY_OFF_NOTE =
    'Skipped MuninnDB (--skip-muninndb): runs will have memory off.'

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

/** The user-scope entry init leaves in Claude Code. Pure. */
const rightEntry = ({ token }: { token: string }): McpServer => ({
    name: MUNINN_SERVER_NAME,
    scope: 'user',
    transport: 'http',
    url: MUNINN_MCP_URL,
    headers: { Authorization: `Bearer ${token}` },
})

const isRight = ({
    server,
    right,
}: {
    server: McpServer
    right: McpServer
}): boolean =>
    server.transport === right.transport &&
    server.url === right.url &&
    server.headers.Authorization === right.headers.Authorization

/** Any text with the token swapped for `***`. Pure. */
const hideToken = ({
    text,
    token,
}: {
    text: string
    token: string | null
}): string =>
    token === null || token === '' ? text : text.split(token).join('***')

/**
 * Runs `luca init`'s memory part against `home` with these adapters.
 * Never throws: a failure is logged (token hidden) and ends with `ok: false`.
 *
 * @example
 * const end = await runInit({ home: homedir(), skip_muninndb: false, muninn, claude, launchctl, log: console.log })
 */
export const runInit = async ({
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
}): Promise<InitEnd> => {
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
        const right = rightEntry({ token })
        const current = (await claude.listMcpServers()).find(
            ({ name, scope }) => name === MUNINN_SERVER_NAME && scope === 'user'
        )
        if (current !== undefined && isRight({ server: current, right })) {
            log('[luca init] Claude Code: the user-scope muninn entry is right')
        } else {
            if (current !== undefined) {
                await claude.removeMcpServer({
                    name: MUNINN_SERVER_NAME,
                    scope: 'user',
                })
                log('[luca init] Claude Code: removed the wrong muninn entry')
            }
            await claude.addMcpServer(right)
            log('[luca init] Claude Code: added the user-scope muninn entry')
        }

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
