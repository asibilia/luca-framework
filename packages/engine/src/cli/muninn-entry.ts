import {
    MUNINN_MCP_URL,
    MUNINN_SERVER_NAME,
    type ClaudeMcp,
    type McpServer,
} from './computer-adapters'

/**
 * Claude Code's `muninn` entry, the one the engine reads: a user-scope MCP
 * server over HTTP whose `Authorization` header holds the literal token
 * from MuninnDB's token file. `luca init` and `luca doctor --fix` make it
 * right; `luca doctor` checks it. The token is never shown.
 */

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

/** Any text with the token swapped for `***`. Pure. */
export const hideToken = ({
    text,
    token,
}: {
    text: string
    token: string | null
}): string =>
    token === null || token === '' ? text : text.split(token).join('***')

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
