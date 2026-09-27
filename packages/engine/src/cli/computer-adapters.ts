/**
 * The adapters `luca init`, `luca doctor`, and `luca upgrade` share, so
 * tests use fakes: MuninnDB's CLI and health endpoint, Claude Code's
 * `claude mcp`, Paseo and its plugins, the computer's tools, and a question
 * to the user. The real ones are in `computer-adapters-real.ts`.
 */

/** Where MuninnDB serves MCP. */
export const MUNINN_MCP_URL = 'http://127.0.0.1:8750/mcp'

/** MuninnDB's health endpoint. */
export const MUNINN_HEALTH_URL = 'http://127.0.0.1:8475/api/health'

/** The name of Claude Code's MuninnDB entry, the one the engine reads. */
export const MUNINN_SERVER_NAME = 'muninn'

/** The board plugin's id in Paseo. */
export const BOARD_PLUGIN_ID = 'luca-board'

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

/** MuninnDB's health endpoint: its version while it runs, else `null`. */
export type MuninnHealth = () => Promise<{ version: string } | null>

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

/** Paseo: its plugins, its version, and the loaded board's Luca version. */
export type Paseo = PaseoPlugins & {
    /** Paseo's version. Fails when Paseo isn't running. */
    version: () => Promise<string>
    /** The Luca version the loaded board reports; `null` with no board. */
    boardVersion: () => Promise<string | null>
}

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

/** A yes-or-no question to the user; `true` is yes. */
export type Ask = (args: { question: string }) => Promise<boolean>

/** The installed Luca: its version, its board folder, and its paths. */
export type LucaInstall = {
    /** The installed Luca's version. */
    luca_version: string
    /** The board folder inside Luca's install folder. */
    board_dir: string
    /** The real path of the installed `luca-run`. */
    engine_path: string
    /** Bun's own path. */
    bun_path: string
}
