import { join } from 'node:path'

import { PLUGIN_ID, RUN_USAGE } from '../shared/board-state'
import type { EngineSettings } from '../shared/engine-settings'

/**
 * How `/luca-run` finds and starts the engine: parse the command's args, find
 * the engine (a setting, else an installed `luca-run`), find Bun, and build
 * the argv. Never uses the plugin's own folder: inside the plugin process
 * `import.meta.url` is undefined and the cwd is `/`.
 */

/** What a run builds: one spec, or the engine's safe practice run. */
export type RunTarget = { kind: 'spec'; spec: number } | { kind: 'demo' }

/**
 * Reads what followed `/luca-run`: `123`, `#123`, or `demo`.
 *
 * @example
 * parseRunArgs({ args: '#12' }) // { ok: true, target: { kind: 'spec', spec: 12 } }
 * parseRunArgs({ args: 'soon' }).ok // false
 */
export const parseRunArgs = ({
    args,
}: {
    args: string
}): { ok: true; target: RunTarget } | { ok: false; message: string } => {
    const text = args.trim()
    if (text.toLowerCase() === 'demo') {
        return { ok: true, target: { kind: 'demo' } }
    }
    const match = /^#?(\d+)$/.exec(text)
    const spec = match?.[1] ? Number(match[1]) : 0
    if (spec > 0 && Number.isSafeInteger(spec)) {
        return { ok: true, target: { kind: 'spec', spec } }
    }
    return {
        ok: false,
        message:
            text === ''
                ? `Which spec? Usage: ${RUN_USAGE}`
                : `"${text}" isn't a spec number. Usage: ${RUN_USAGE}`,
    }
}

const two = ({ value }: { value: number }) => String(value).padStart(2, '0')

/**
 * A run id unique per launch: `luca-<yyyymmdd-hhmmss>-<4 of [a-z0-9]>` (UTC).
 *
 * @example
 * mintRunId({ now: new Date(), suffix: 'k3x9' }) // 'luca-20260923-123042-k3x9'
 */
export const mintRunId = ({
    now,
    suffix,
}: {
    now: Date
    suffix: string
}): string => {
    const date = `${now.getUTCFullYear()}${two({ value: now.getUTCMonth() + 1 })}${two({ value: now.getUTCDate() })}`
    const time = `${two({ value: now.getUTCHours() })}${two({ value: now.getUTCMinutes() })}${two({ value: now.getUTCSeconds() })}`
    return `luca-${date}-${time}-${suffix}`
}

/** Where an installed `luca-run` command may be. */
export const installedCommandPaths = ({
    home_dir,
}: {
    home_dir: string
}): string[] => [
    join(home_dir, '.bun/bin/luca-run'),
    '/opt/homebrew/bin/luca-run',
    '/usr/local/bin/luca-run',
]

/** Where Bun may be, after the `bun_path` setting and `LUCA_BUN`. */
const bunPaths = ({ home_dir }: { home_dir: string }): string[] => [
    join(home_dir, '.bun/bin/bun'),
    '/opt/homebrew/bin/bun',
    '/usr/local/bin/bun',
]

export const SETTINGS_HINT = `Set the engine path in Settings → Plugins → ${PLUGIN_ID}`

/**
 * Finds how to start the engine. The `engine_path` setting (run with Bun)
 * wins; else an installed `luca-run` command, run directly (it has a Bun
 * shebang). Paths are absolute because Paseo swaps a bare `bun` for its Node.
 *
 * @returns the command and the args that go before the run's own args, or a
 *   message that says what to set.
 */
export const resolveEngine = ({
    settings,
    env,
    home_dir,
    file_exists,
}: {
    settings: EngineSettings
    env: Record<string, string | undefined>
    home_dir: string
    file_exists: ({ path }: { path: string }) => boolean
}):
    | { ok: true; command: string; lead_args: string[] }
    | { ok: false; message: string } => {
    const engine_path = settings.engine_path.trim()
    if (engine_path !== '') {
        if (!engine_path.startsWith('/')) {
            return {
                ok: false,
                message: `The engine path must be absolute, but it is "${engine_path}". ${SETTINGS_HINT}.`,
            }
        }
        if (!file_exists({ path: engine_path })) {
            return {
                ok: false,
                message: `The engine path ${engine_path} doesn't exist. ${SETTINGS_HINT}.`,
            }
        }
        const bun = [
            settings.bun_path.trim(),
            env.LUCA_BUN ?? '',
            ...bunPaths({ home_dir }),
        ].find((path) => path.startsWith('/') && file_exists({ path }))
        if (!bun) {
            return {
                ok: false,
                message: `Couldn't find Bun. Set the Bun path in Settings → Plugins → ${PLUGIN_ID}, or set LUCA_BUN.`,
            }
        }
        return { ok: true, command: bun, lead_args: [engine_path] }
    }
    const installed = installedCommandPaths({ home_dir }).find((path) =>
        file_exists({ path })
    )
    if (installed) return { ok: true, command: installed, lead_args: [] }
    return {
        ok: false,
        message: `Couldn't find the Luca engine: no engine path is set and no luca-run command is installed. ${SETTINGS_HINT} (the absolute path to the engine's luca-run.ts).`,
    }
}

/** The run's own engine args, after the command and `lead_args`. */
export const engineArgs = ({
    target,
    repo,
    run_id,
}: {
    target: RunTarget
    repo: string
    run_id: string
}): string[] => [
    ...(target.kind === 'demo' ? ['--demo'] : ['--spec', String(target.spec)]),
    '--repo',
    repo,
    '--run-id',
    run_id,
    '--board-plugin',
    PLUGIN_ID,
]
