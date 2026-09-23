import { existsSync } from 'node:fs'
import { homedir } from 'node:os'

import type {
    PluginHandlerContext,
    PluginServerContext,
} from '@getpaseo/plugin/server'

import { createBoardServer } from './server/board-server'
import { defaultRegistryPath } from './server/run-registry'
import { spawnDetached } from './server/spawn-detached'
import { ROW_VERSION } from './shared/board-rows'
import { boardReadRpc, engineEventRpc, runStartRpc } from './shared/board-rpc'
import { PLUGIN_ID } from './shared/board-state'
import {
    EngineSettingsSchema,
    engineSettings,
    type EngineSettings,
} from './shared/engine-settings'

type Paseo = PluginHandlerContext['paseo']

const log = (message: string) => console.error(`[${PLUGIN_ID}] ${message}`)

/**
 * The board plugin's daemon side: the engine settings, `run.start` (launch a
 * run from `/luca-run`), `engine.event` (the engine's journal records in),
 * and `board.read` (the side panel's poll). The logic lives in
 * `createBoardServer`; this entry only wires it to Paseo.
 */
export default function contribute(server: PluginServerContext) {
    const settings = server.registerSettings(engineSettings)
    // Every handler gets the same subprocess connection; keep the latest one
    // so rows can be appended from queued work.
    let paseo: Paseo | null = null
    const connect = ({ context }: { context: PluginHandlerContext }) => {
        paseo = context.paseo
    }

    const readSettings = async (): Promise<EngineSettings> => {
        const current = await settings.read()
        if (current.status === 'ready') return current.values
        log(`The engine settings are invalid, using defaults: ${current.error}`)
        return EngineSettingsSchema.parse({})
    }

    const board = createBoardServer({
        registry_path: defaultRegistryPath({
            env: process.env,
            home_dir: homedir(),
        }),
        append_row: async ({ agent_id, row }) => {
            if (!paseo) throw new Error('no Paseo connection yet')
            await paseo.agents.ref(agent_id).timeline.append({
                type: 'plugin',
                id: row.id,
                kind: row.kind,
                version: ROW_VERSION,
                data: row.data,
            })
        },
        spawn_engine: spawnDetached,
        read_settings: readSettings,
        file_exists: ({ path }) => existsSync(path),
        home_dir: homedir(),
        env: process.env,
        log_dir: '/tmp',
        now: () => new Date(),
        log,
    })

    server.handle(runStartRpc, (input, context) => {
        connect({ context })
        return board.startRun(input)
    })
    server.handle(engineEventRpc, (input, context) => {
        connect({ context })
        return board.handleEngineEvent(input)
    })
    server.handle(boardReadRpc, (input, context) => {
        connect({ context })
        return board.readBoard(input)
    })

    return async () => {
        await board.idle()
    }
}

