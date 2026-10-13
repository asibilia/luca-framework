import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type {
    PluginHandlerContext,
    PluginServerContext,
} from '@getpaseo/plugin/server'
import { afterEach, describe, expect, test } from 'bun:test'

import contribute from '../index.server'
import { boardVersionRpc } from '../shared/board-rpc'

/**
 * The board's version at its RPC (seam 3), loaded from the repo's source:
 * `board.version` answers the dev value, not a version read from a file
 * next to the board's module (the board's own package.json says `0.0.0`).
 * The published package's pack step stamps the real version (#477).
 */

/** The version the board answers when it runs from the repo's source. */
const DEV_VERSION = 'dev (source)'

/** The board's state and runs go to throwaway folders, never the user's. */
const STATE_ENV = ['LUCA_BOARD_STATE_DIR', 'LUCA_RUNS_DIR'] as const

const dirs: string[] = []
const saved = new Map<string, string | undefined>()

afterEach(async () => {
    for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
    }
    saved.clear()
    for (const dir of dirs.splice(0)) {
        await rm(dir, { recursive: true, force: true })
    }
})

type Call = (input: unknown) => Promise<unknown>

/**
 * A stand-in for Paseo's plugin server: it keeps each RPC handler the board
 * registers, and calls it the way Paseo does, parsing input and output with
 * the contract.
 */
const fakeServer = () => {
    const calls = new Map<string, Call>()
    const context: PluginHandlerContext = {
        paseo: {} as PluginHandlerContext['paseo'],
    }
    const server: PluginServerContext = {
        registerSettings: () => ({
            read: async () => ({
                status: 'invalid',
                revision: '0',
                error: 'no settings in this test',
            }),
            subscribe: () => async () => {},
        }),
        handle: (contract, handler) => {
            calls.set(contract.name, async (input) =>
                contract.output.parse(
                    await handler(contract.input.parse(input), context)
                )
            )
        },
        registerProvider: () => {},
        on: () => () => {},
        before: () => () => {},
    }
    return { server, calls }
}

/** Loads the board from source into a fake Paseo, on throwaway state. */
const loadBoard = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'luca-board-version-'))
    dirs.push(dir)
    for (const name of STATE_ENV) {
        saved.set(name, process.env[name])
        process.env[name] = join(dir, name)
    }
    const { server, calls } = fakeServer()
    const cleanup = contribute(server)
    return { calls, cleanup }
}

describe('board.version, with the board loaded from the repo source', () => {
    test('it answers the dev version', async () => {
        const { calls, cleanup } = await loadBoard()
        try {
            const call = calls.get(boardVersionRpc.name)
            expect(call).toBeDefined()

            expect(await call?.({})).toEqual({ version: DEV_VERSION })
        } finally {
            await cleanup()
        }
    })
})
