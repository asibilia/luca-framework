import { homedir } from 'node:os'
import { join } from 'node:path'

import { DaemonClient } from '@getpaseo/client/internal/daemon-client'
import { z } from 'zod'

import { BoardReplySchema, type BoardLink } from './board-sync'

/** The plugin RPC method the engine sends its journal records to. */
export const ENGINE_EVENT_METHOD = 'engine.event'

const CONNECT_TIMEOUT_MS = 5000

const PidFileSchema = z.object({ listen: z.string().min(1) })

/**
 * Where the Paseo daemon listens: `PASEO_HOST`, or the `listen` field of
 * `$PASEO_HOME/paseo.pid` (`~/.paseo/paseo.pid` by default).
 */
export const daemonAddress = async (): Promise<string> => {
    const host = process.env.PASEO_HOST
    if (host !== undefined && host !== '') return host
    const home = process.env.PASEO_HOME ?? join(homedir(), '.paseo')
    const file = join(home, 'paseo.pid')
    const parsed = PidFileSchema.safeParse(
        JSON.parse(await Bun.file(file).text())
    )
    if (!parsed.success) {
        throw new Error(`${file} has no "listen" address for the daemon.`)
    }
    return parsed.data.listen
}

/**
 * The engine's Paseo client id, one per run, so two runs at once never
 * share one Paseo session.
 *
 * @example
 * engineClientId({ run_id: 'luca-20260925-101500-aaaa' })
 * // 'luca-engine-luca-20260925-101500-aaaa'
 */
export const engineClientId = ({ run_id }: { run_id: string }): string =>
    `luca-engine-${run_id}`

const connect = async ({
    run_id,
}: {
    run_id: string
}): Promise<DaemonClient> => {
    const password = process.env.PASEO_PASSWORD
    const client = new DaemonClient({
        url: `ws://${await daemonAddress()}/ws`,
        clientId: engineClientId({ run_id }),
        clientType: 'cli',
        reconnect: { enabled: false },
        connectTimeoutMs: CONNECT_TIMEOUT_MS,
        ...(password === undefined || password === '' ? {} : { password }),
    })
    await client.connect()
    return client
}

/**
 * The board link over Paseo: calls the board plugin's `engine.event` RPC
 * through the local daemon's websocket, with
 * `{ run_id, token, records, ended }`, and checks its
 * `{ ok, next_seq, message }` answer.
 *
 * Connects on the first send and keeps that one connection for the run. A
 * send that fails drops the connection and tries once more on a fresh one;
 * a second failure throws, which `createBoardSync` logs and swallows.
 *
 * @param plugin_id - The board plugin's id, such as `luca-board`.
 * @param run_id - The run the records belong to.
 * @param token - The per-run token the plugin minted when it launched the engine.
 *
 * @example
 * const link = createPaseoBoardLink({ plugin_id: 'luca-board', run_id, token })
 * const board = createBoardSync({ link })
 */
export const createPaseoBoardLink = ({
    plugin_id,
    run_id,
    token,
}: {
    plugin_id: string
    run_id: string
    token: string
}): BoardLink => {
    let client: DaemonClient | null = null

    const drop = async () => {
        const open = client
        client = null
        await open?.close().catch(() => undefined)
    }

    const invoke: BoardLink['send'] = async ({ records, ended }) => {
        client = client ?? (await connect({ run_id }))
        const reply = await client.invokePluginRpc(
            plugin_id,
            ENGINE_EVENT_METHOD,
            { run_id, token, records, ended }
        )
        const parsed = BoardReplySchema.safeParse(reply)
        if (!parsed.success) {
            throw new Error(
                `The board answered ${ENGINE_EVENT_METHOD} with an unexpected shape: ${z.prettifyError(parsed.error)}`
            )
        }
        return parsed.data
    }

    return {
        send: async (args) => {
            try {
                return await invoke(args)
            } catch {
                await drop()
                return invoke(args)
            }
        },
        close: drop,
    }
}
