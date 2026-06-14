/**
 * Read the MuninnDB MCP credential token from disk.
 *
 * The token is written by `muninn init` to `~/.muninn/mcp.token`. Multiple
 * init/MCP-wiring call sites need to read it (Antigravity `mcp_config.json`
 * writer, the Claude `claude mcp add` shell-out), so the read is factored
 * into this single shared helper rather than duplicated inline.
 *
 * @param path - Token file path. Defaults to `~/.muninn/mcp.token`. The
 *   optional override exists so tests/probes can target a temp fixture
 *   instead of the real credential file.
 * @returns The trimmed token string, or `undefined` when the file is absent
 *   or unreadable (callers gate on the missing token themselves).
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'

import { join } from 'pathe'

export async function readMuninnToken(
    path: string = join(homedir(), '.muninn', 'mcp.token')
): Promise<string | undefined> {
    try {
        if (existsSync(path)) {
            return (await readFile(path, 'utf-8')).trim()
        }
    } catch {
        // silently ignore read errors — callers treat absent token as "skip"
    }
    return undefined
}
