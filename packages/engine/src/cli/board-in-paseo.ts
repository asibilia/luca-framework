import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'

import {
    BOARD_PLUGIN_ID,
    type Ask,
    type PaseoPlugins,
    type PluginSettings,
} from './computer-adapters'
import { reason } from './doctor-checks'

/**
 * The board in Paseo: installed as a folder source, the board folder inside
 * Luca's own install folder, so the board and the engine are always the
 * same version, with its engine and Bun paths written. `luca init`, `luca
 * doctor --fix`, and `luca upgrade` put it there.
 */

/** How one step ended; `message` is the last line it printed. */
export type StepEnd = { ok: boolean; message: string }

/** A path's real path, or the path as is when it can't be resolved. */
export const realPath = (path: string): string => {
    try {
        return realpathSync(path)
    } catch {
        return resolve(path)
    }
}

/**
 * Puts the board into Paseo from `board_dir`, with Paseo's plugins on, and
 * writes its engine and Bun paths, keeping its other settings. When the
 * board is already installed from that folder, it is reloaded; from another
 * folder, its settings are read, it is removed and installed again, and
 * they are written back, as removing a plugin wipes its settings and
 * installing over an id fails. Logs each step after `prefix`. Throws when
 * Paseo fails. `installed` says whether the board was installed anew.
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
    const say = ({ message, ok }: StepEnd): StepEnd => {
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
                return say({
                    message: `[${command}] Board: Paseo's plugins are off, so the board wasn't installed. Turn them on in Paseo's Settings, then run luca init again.`,
                    ok: false,
                })
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
        return say({
            message: installed
                ? `[${command}] Board is ready. Run /reload-skills in a Paseo chat so /luca-run shows up.`
                : `[${command}] Board is ready.`,
            ok: true,
        })
    } catch (error) {
        return say({
            message: `[${command}] Board: ${reason(error)}`,
            ok: false,
        })
    }
}
