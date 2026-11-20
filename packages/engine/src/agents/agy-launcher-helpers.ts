import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach } from 'bun:test'

import type { AgySpawnedProcess, AgySpawner } from './agy-launcher'

import type { EngineConfig } from '../config/engine-config'

/**
 * Shared fake spawner and isolated temp workspace helpers for
 * `agy-launcher.test.ts` and `agy-launcher-lifecycle.test.ts`.
 */

export const AGY_PATH = '/opt/fake/bin/agy'

export const AGY_CONFIG: EngineConfig = {
    checks: { test: 'bun test', types: 'bunx --bun tsc --noEmit' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
    rule_files: [],
}

export const encoder = new TextEncoder()

export const agyInit = ({
    conversation_id = 'conv-1',
    model = 'gemini-4-neon-high',
}: {
    conversation_id?: string
    model?: string
} = {}): Record<string, unknown> => ({
    event: 'init',
    conversation_id,
    init: { model, cwd: '/unused', tools: ['view_file', 'finish'] },
})

export const agyResult = ({
    conversation_id = 'conv-1',
    status = 'SUCCESS',
    structured_output = { ok: true },
    error,
}: {
    conversation_id?: string | null
    status?: 'SUCCESS' | 'ERROR'
    structured_output?: unknown
    error?: string
} = {}): Record<string, unknown> => ({
    event: 'result',
    result: {
        ...(conversation_id === null ? {} : { conversation_id }),
        status,
        duration_seconds: 1.2,
        num_turns: 2,
        ...(structured_output === undefined ? {} : { structured_output }),
        ...(error === undefined ? {} : { error }),
        usage: {
            input_tokens: 10,
            output_tokens: 20,
            thinking_tokens: 5,
            cache_read_tokens: 3,
            total_tokens: 38,
        },
    },
})

export type FakeSpawnCall = {
    command: string
    argv: string[]
    cwd: string
    env: Record<string, string>
    signals: string[]
}

export type FakeTurnScript = {
    events?: Array<Record<string, unknown> | string>
    stderr?: string
    exit_code?: number
    hang?: boolean
    delay_ms?: number
    on_spawn?: (args: {
        command: string
        argv: string[]
        cwd: string
        env: Record<string, string>
    }) => void
    on_kill?: (args: {
        signal: string
        resolve_exit: (code: number) => void
    }) => void
}

const toNdjson = (events: Array<Record<string, unknown> | string>): string =>
    events
        .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
        .join('\n') + (events.length > 0 ? '\n' : '')

export const fakeAgySpawner = ({
    turns,
    throw_on_spawn,
}: {
    turns?: FakeTurnScript[]
    throw_on_spawn?: Error
} = {}): {
    spawn: AgySpawner
    calls: FakeSpawnCall[]
} => {
    const calls: FakeSpawnCall[] = []
    let index = 0

    const spawn: AgySpawner = ({ command, argv, cwd, env }) => {
        if (throw_on_spawn !== undefined) throw throw_on_spawn
        const script = turns?.[index] ?? {
            events: [agyInit({}), agyResult({})],
        }
        index += 1
        const signals: string[] = []
        calls.push({ command, argv, cwd, env, signals })
        script.on_spawn?.({ command, argv, cwd, env })

        let resolve_exit!: (code: number) => void
        const exited = new Promise<number>((resolve) => {
            resolve_exit = resolve
        })

        const stdout = new ReadableStream<Uint8Array>({
            async start(controller) {
                if (script.delay_ms !== undefined) {
                    await Bun.sleep(script.delay_ms)
                }
                const text = toNdjson(script.events ?? [])
                if (text !== '') controller.enqueue(encoder.encode(text))
                if (!script.hang) {
                    controller.close()
                    resolve_exit(script.exit_code ?? 0)
                }
            },
        })

        const stderr = new ReadableStream<Uint8Array>({
            start(controller) {
                if (script.stderr !== undefined && script.stderr !== '') {
                    controller.enqueue(encoder.encode(script.stderr))
                }
                if (!script.hang) controller.close()
            },
        })

        const proc: AgySpawnedProcess = {
            stdout,
            stderr,
            exited,
            kill: (signal = 'SIGTERM') => {
                const name = String(signal)
                signals.push(name)
                if (script.on_kill !== undefined) {
                    script.on_kill({ signal: name, resolve_exit })
                    return
                }
                if (name === 'SIGTERM') resolve_exit(143)
                else if (name === 'SIGKILL') resolve_exit(137)
            },
        }
        return proc
    }

    return { spawn, calls }
}

export type AgyTestDirs = {
    worktree: string
    temp_root: string
}

export const useAgyTestDirs = (): AgyTestDirs => {
    const dirs: AgyTestDirs = { worktree: '', temp_root: '' }

    beforeEach(() => {
        dirs.worktree = realpathSync(
            mkdtempSync(join(tmpdir(), 'agy-worktree-'))
        )
        dirs.temp_root = realpathSync(mkdtempSync(join(tmpdir(), 'agy-temp-')))
    })

    afterEach(() => {
        if (dirs.worktree !== '') {
            rmSync(dirs.worktree, { recursive: true, force: true })
        }
        if (dirs.temp_root !== '') {
            rmSync(dirs.temp_root, { recursive: true, force: true })
        }
    })

    return dirs
}
