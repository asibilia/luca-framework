import {
    existsSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ProviderId } from '../agents/provider'
import {
    EngineConfigSchema,
    type EffortLevel,
    type EngineConfig,
} from '../config/engine-config'

/**
 * Shared E2E helpers for Spec #777 (`agy` Gemini provider): fake process
 * spawner, NDJSON stream builders, isolated temp directories, config
 * factories, and JSONL readers. Imports only Node builtins, Zod, and engine
 * modules so `pack.test.ts` runtime-dependency checks stay green.
 */

export type FakeAgySpawnArgs = {
    command: string
    argv: string[]
    cwd: string
    env: Record<string, string>
}

export type FakeAgySpawnedProcess = {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
    kill: (signal?: number | NodeJS.Signals) => void
}

export type FakeAgySpawnCall = {
    command: string
    argv: string[]
    cwd: string
    env: Record<string, string>
    killed_with: (number | NodeJS.Signals)[]
}

export type FakeAgyTurnSpec = {
    lines?: (string | Record<string, unknown>)[]
    stderr?: string
    exit_code?: number
    delay_ms?: number
    hang?: boolean
    kill_exit_code?: number
    on_kill?: (signal?: number | NodeJS.Signals) => void
    capture_env?: boolean
    capture_argv?: boolean
    capture_cwd?: boolean
    on_spawn?: (args: FakeAgySpawnArgs) => Promise<void> | void
}

const encoder = new TextEncoder()

/** Builds a `ReadableStream<Uint8Array>` from NDJSON objects or raw lines. */
export const ndjsonStream = ({
    lines,
}: {
    lines: (string | Record<string, unknown>)[]
}): ReadableStream<Uint8Array> => {
    const body = lines
        .map((line) => (typeof line === 'string' ? line : JSON.stringify(line)))
        .join('\n')
    const text = body === '' ? '' : `${body}\n`
    return new ReadableStream<Uint8Array>({
        start(controller) {
            if (text !== '') controller.enqueue(encoder.encode(text))
            controller.close()
        },
    })
}

/**
 * Creates a deterministic fake `AgySpawner` backed by scripted `turns`,
 * capturing every invocation's `command`, `argv`, `cwd`, `env`, and kill
 * signals. Supports `hang`, `delay_ms`, `exit_code`, `stderr`, and
 * `on_spawn` hooks (e.g. to run `agy-hook.ts` against `LUCA_AGY_STATE_DIR`).
 */
export const createFakeAgySpawner = ({
    turns,
}: {
    turns: FakeAgyTurnSpec[]
}): {
    spawner: (args: FakeAgySpawnArgs) => FakeAgySpawnedProcess
    calls: FakeAgySpawnCall[]
} => {
    const queue = [...turns]
    const calls: FakeAgySpawnCall[] = []

    const spawner = (args: FakeAgySpawnArgs): FakeAgySpawnedProcess => {
        const turn = queue.shift()
        if (turn === undefined) {
            throw new Error(
                `Unexpected agy spawn #${calls.length + 1}: no scripted turn left.`
            )
        }
        const call: FakeAgySpawnCall = {
            command: args.command,
            argv: turn.capture_argv === false ? [] : [...args.argv],
            cwd: turn.capture_cwd === false ? '' : args.cwd,
            env: turn.capture_env === false ? {} : { ...args.env },
            killed_with: [],
        }
        calls.push(call)

        const payload = (turn.lines ?? [])
            .map((line) =>
                typeof line === 'string' ? line : JSON.stringify(line)
            )
            .join('\n')
        const ndjson = payload === '' ? '' : `${payload}\n`
        const stderrText = turn.stderr ?? ''

        let outController: ReadableStreamDefaultController<Uint8Array> | null =
            null
        let errController: ReadableStreamDefaultController<Uint8Array> | null =
            null
        let closed = false
        let timer: ReturnType<typeof setTimeout> | null = null
        let resolveExited: (code: number) => void = () => {}

        const exited = new Promise<number>((resolve) => {
            resolveExited = resolve
        })

        const finish = (code: number) => {
            if (closed) return
            closed = true
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            try {
                outController?.close()
            } catch {
                // Stream already closed.
            }
            try {
                errController?.close()
            } catch {
                // Stream already closed.
            }
            resolveExited(code)
        }

        const stdout = new ReadableStream<Uint8Array>({
            start(controller) {
                outController = controller
                if (ndjson !== '') controller.enqueue(encoder.encode(ndjson))
            },
        })

        const stderr = new ReadableStream<Uint8Array>({
            start(controller) {
                errController = controller
                if (stderrText !== '') {
                    controller.enqueue(encoder.encode(stderrText))
                }
            },
        })

        const kill = (signal: number | NodeJS.Signals = 'SIGTERM') => {
            call.killed_with.push(signal)
            turn.on_kill?.(signal)
            finish(turn.kill_exit_code ?? 143)
        }

        const drive = async () => {
            if (turn.on_spawn !== undefined) {
                await turn.on_spawn(args)
            }
            if (turn.hang === true) return
            const delay = turn.delay_ms ?? 0
            if (delay > 0) {
                timer = setTimeout(() => {
                    finish(turn.exit_code ?? 0)
                }, delay)
                return
            }
            finish(turn.exit_code ?? 0)
        }

        void drive()

        return { stdout, stderr, exited, kill }
    }

    return { spawner, calls }
}

/** Creates an isolated temp directory resolved through `realpathSync`. */
export const createTempRoot = ({
    prefix = 'luca-agy-e2e-',
}: {
    prefix?: string
} = {}): string => realpathSync(mkdtempSync(join(tmpdir(), prefix)))

/** Recursively removes a temporary directory, ignoring missing paths. */
export const cleanupDir = ({ dir }: { dir: string }): void => {
    if (dir !== '') rmSync(dir, { recursive: true, force: true })
}

/** Builds a validated `EngineConfig` via `EngineConfigSchema.parse`. */
export const makeAgyConfig = ({
    provider = 'agy',
    floors,
    effort,
    confidence_bar,
    trial_share,
    checks,
    test_file_patterns,
    rule_files,
    feature_map,
    auto_retry,
}: {
    provider?: ProviderId
    floors?: Record<string, string>
    effort?: Record<string, EffortLevel>
    confidence_bar?: number
    trial_share?: number
    checks?: EngineConfig['checks']
    test_file_patterns?: string[]
    rule_files?: string[]
    feature_map?: string
    auto_retry?: boolean
} = {}): EngineConfig =>
    EngineConfigSchema.parse({
        checks: checks ?? { test: 'bun test' },
        ...(test_file_patterns === undefined ? {} : { test_file_patterns }),
        ...(rule_files === undefined ? {} : { rule_files }),
        ...(feature_map === undefined ? {} : { feature_map }),
        ...(auto_retry === undefined ? {} : { auto_retry }),
        models: {
            provider,
            ...(floors === undefined ? {} : { floors }),
            ...(effort === undefined ? {} : { effort }),
            ...(confidence_bar === undefined ? {} : { confidence_bar }),
            ...(trial_share === undefined ? {} : { trial_share }),
        },
    })

/** Reads and parses every non-empty JSON line from `path` (or `[]` if absent). */
export const readJsonLines = ({ path }: { path: string }): unknown[] => {
    if (!existsSync(path)) return []
    return readFileSync(path, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line))
}
