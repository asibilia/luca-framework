/**
 * Antigravity (`agy`) agent launcher behind the `AgentLauncher` seam (#782).
 *
 * Spawns `agy` in sandboxed NDJSON streaming mode with per-session `--add-dir`
 * hooks, zero worktree writes, strict credential stripping, and multi-turn
 * `--conversation` follow-ups.
 */
import { realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'

import type { AgentLauncher, AgentTurn } from './agent-launcher'
import {
    agyEnv,
    buildAgyArgv,
    createAgySessionFiles,
    isAgyOutOfTurns,
    readAgyDenials,
    removeAgySessionDir,
    resetAgyTurnFiles,
    writeAgyHookState,
    type AgySessionFiles,
} from './agy-launcher-files'
import { runAgyStream } from './agy-stream'
import type { AgyHookState } from './agy-tool-rules'
import { DEFAULT_TURN_TIMEOUT_MS } from './claude-launcher'
import { isProviderModel, PROVIDERS } from './provider'
import { roleInstructions } from './role-instructions'
import type { AgentRole } from './role-results'
import { MAX_TURNS } from './role-turns'

import { guardRoleOf } from '../guards/role-rules'

export { checkAgyModel } from './agy-stream'

/** Minimal spawned-process contract consumed by `createAgyLauncher`. */
export type AgySpawnedProcess = {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
    kill: (signal?: number | NodeJS.Signals) => void
}

/** Process spawner hook (defaults to `Bun.spawn`, injectable in tests). */
export type AgySpawner = (args: {
    command: string
    argv: string[]
    cwd: string
    env: Record<string, string>
}) => AgySpawnedProcess

/** Configuration options for `createAgyLauncher`. */
export type AgyLauncherOptions = {
    agy_path?: string
    spawn?: AgySpawner
    turn_timeout_ms?: number
    env?: Record<string, string | undefined>
    hook_script_path?: string
    temp_root?: string
    now?: () => number
}

type OpenAgySession = {
    role: AgentRole
    ticket: number
    model: string
    effort: EffortLevel
    worktree_real: string
    files: AgySessionFiles
    state: AgyHookState
    turn_index: number
    cleanup: () => void
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const defaultSpawn: AgySpawner = ({ command, argv, cwd, env }) =>
    Bun.spawn([command, ...argv], {
        cwd,
        env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
    })

const shouldKeepOpen = (turn: AgentTurn): boolean =>
    turn.ok ||
    (turn.failure === 'agent' &&
        turn.session_closed !== true &&
        turn.session_id !== undefined)

/**
 * Refuses models outside `AGY_MODEL_NAMES` before spawning `agy`, returning
 * `null` when valid or a stop reason otherwise.
 */
export const checkAgyLaunchModel = ({
    model,
}: {
    model: string
}): string | null =>
    isProviderModel({ provider: 'agy', model })
        ? null
        : `Agents on agy launch only on ${PROVIDERS.agy.tiers.join(', ')}: ${model}`

/**
 * Creates an `AgentLauncher` backed by the local `agy` CLI.
 */
export const createAgyLauncher = ({
    agy_path,
    spawn,
    turn_timeout_ms,
    env,
    hook_script_path,
    temp_root,
    now,
}: AgyLauncherOptions = {}): AgentLauncher & {
    closeAll: () => Promise<void>
} => {
    const spawnProcess = spawn ?? defaultSpawn
    const timeout_ms = turn_timeout_ms ?? DEFAULT_TURN_TIMEOUT_MS
    const hook_script = hook_script_path ?? join(import.meta.dir, 'agy-hook.ts')
    const root_dir = temp_root ?? tmpdir()
    const sessions = new Map<string, OpenAgySession>()

    const launch: AgentLauncher['launch'] = async ({
        role,
        ticket,
        prompt,
        cwd,
        may_edit_tests,
        config,
        model,
        effort,
        max_turns,
        on_progress,
    }) => {
        const refused = checkAgyLaunchModel({ model })
        if (refused !== null) {
            return { ok: false, failure: 'stop', error: refused }
        }
        const binary = agy_path ?? Bun.which('agy') ?? null
        if (binary === null) {
            return {
                ok: false,
                failure: 'stop',
                error: 'No `agy` binary on PATH.',
            }
        }

        let worktree_real: string
        let home_real: string
        try {
            worktree_real = realpathSync(cwd)
            home_real = realpathSync(homedir())
        } catch (error) {
            return { ok: false, failure: 'engine', error: errorText(error) }
        }

        let files: AgySessionFiles
        try {
            files = createAgySessionFiles({
                temp_root: root_dir,
                role,
                bun_path: process.execPath,
                hook_script_path: hook_script,
            })
        } catch (error) {
            return { ok: false, failure: 'engine', error: errorText(error) }
        }

        let cleaned = false
        let registered_id: string | null = null
        const cleanup = () => {
            if (registered_id !== null) sessions.delete(registered_id)
            if (cleaned) return
            cleaned = true
            removeAgySessionDir({ temp_dir: files.temp_dir })
        }

        const state: AgyHookState = {
            role,
            guard_role: guardRoleOf({ role }),
            worktree_real,
            state_dir_real: files.temp_dir,
            home_real,
            may_edit_tests,
            config,
            cwd,
            max_turns: max_turns ?? MAX_TURNS[role],
            instructions: roleInstructions({
                role,
                may_edit_tests,
                config,
                messaging: false,
                provider: 'agy',
            }),
            turn_index: 0,
        }

        let proc: AgySpawnedProcess
        try {
            resetAgyTurnFiles({ files })
            writeAgyHookState({ state_path: files.state_path, state })
            const argv = buildAgyArgv({
                prompt,
                model,
                effort,
                schema_path: files.schema_path,
                hooks_dir: files.hooks_dir,
                turn_timeout_ms: timeout_ms,
            })
            const child_env = agyEnv({
                source: env ?? process.env,
                state_dir: files.temp_dir,
            })
            proc = spawnProcess({
                command: binary,
                argv,
                cwd: worktree_real,
                env: child_env,
            })
        } catch (error) {
            cleanup()
            return {
                ok: false,
                failure: 'engine',
                error: `Failed to spawn agy: ${errorText(error)}`,
            }
        }

        const turn = await runAgyStream({
            stdout: proc.stdout,
            stderr: proc.stderr,
            exited: proc.exited,
            kill: (signal) => proc.kill(signal),
            role,
            worktree: worktree_real,
            is_follow_up: false,
            fallback_id: undefined,
            turn_timeout_ms: timeout_ms,
            on_progress,
            read_denials: () =>
                readAgyDenials({ denials_path: files.denials_path }),
            is_out_of_turns: () =>
                isAgyOutOfTurns({ out_of_turns_path: files.out_of_turns_path }),
            cleanup,
            now,
        })

        if (shouldKeepOpen(turn) && turn.session_id !== undefined) {
            registered_id = turn.session_id
            sessions.set(turn.session_id, {
                role,
                ticket,
                model,
                effort,
                worktree_real,
                files,
                state,
                turn_index: 0,
                cleanup,
            })
        } else {
            cleanup()
        }
        return turn
    }

    const followUp: AgentLauncher['followUp'] = async ({
        session_id,
        role,
        ticket,
        message,
        on_progress,
    }) => {
        const open = sessions.get(session_id)
        if (open === undefined) {
            return {
                ok: false,
                failure: 'engine',
                session_id,
                session_gone: true,
                error: `No open agent session ${session_id}: it closed or never started.`,
            }
        }
        if (open.role !== role || open.ticket !== ticket) {
            return {
                ok: false,
                failure: 'engine',
                session_id,
                error: `Session ${session_id} belongs to the ${open.role} on #${open.ticket}, not the ${role} on #${ticket}.`,
            }
        }
        const binary = agy_path ?? Bun.which('agy') ?? null
        if (binary === null) {
            open.cleanup()
            return {
                ok: false,
                failure: 'stop',
                session_id,
                error: 'No `agy` binary on PATH.',
            }
        }

        open.turn_index += 1
        open.state = { ...open.state, turn_index: open.turn_index }

        let proc: AgySpawnedProcess
        try {
            resetAgyTurnFiles({ files: open.files })
            writeAgyHookState({
                state_path: open.files.state_path,
                state: open.state,
            })
            const argv = buildAgyArgv({
                prompt: message,
                session_id,
                model: open.model,
                effort: open.effort,
                schema_path: open.files.schema_path,
                hooks_dir: open.files.hooks_dir,
                turn_timeout_ms: timeout_ms,
            })
            const child_env = agyEnv({
                source: env ?? process.env,
                state_dir: open.files.temp_dir,
            })
            proc = spawnProcess({
                command: binary,
                argv,
                cwd: open.worktree_real,
                env: child_env,
            })
        } catch (error) {
            open.cleanup()
            return {
                ok: false,
                failure: 'engine',
                session_id,
                error: `Failed to spawn agy: ${errorText(error)}`,
            }
        }

        const turn = await runAgyStream({
            stdout: proc.stdout,
            stderr: proc.stderr,
            exited: proc.exited,
            kill: (signal) => proc.kill(signal),
            role,
            worktree: open.worktree_real,
            is_follow_up: true,
            fallback_id: session_id,
            turn_timeout_ms: timeout_ms,
            on_progress,
            read_denials: () =>
                readAgyDenials({ denials_path: open.files.denials_path }),
            is_out_of_turns: () =>
                isAgyOutOfTurns({
                    out_of_turns_path: open.files.out_of_turns_path,
                }),
            cleanup: open.cleanup,
            now,
        })

        if (!shouldKeepOpen(turn)) open.cleanup()
        return turn
    }

    const closeSession: AgentLauncher['closeSession'] = async ({
        session_id,
    }) => {
        const open = sessions.get(session_id)
        if (open !== undefined) open.cleanup()
    }

    const closeAll = async () => {
        for (const open of [...sessions.values()]) {
            open.cleanup()
        }
    }

    return { launch, followUp, closeSession, closeAll }
}
