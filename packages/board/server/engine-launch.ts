import { dirname, join } from 'node:path'

import { PLUGIN_ID, RUN_USAGE } from '../shared/board-state'
import type { EngineSettings } from '../shared/engine-settings'

/**
 * How `/luca-run` finds and starts the engine: parse the command's args, find
 * the engine (a setting, else an installed `luca-run`), find Bun, and build
 * the argv. Never uses the plugin's own folder: inside the plugin process
 * `import.meta.url` is undefined and the cwd is `/`.
 */

/** What a new run builds: one spec, or the engine's safe practice run. */
export type RunTarget = { kind: 'spec'; spec: number } | { kind: 'demo' }

/** What `/luca-run` asks for: a new run, or to resume a run the board started. */
export type RunRequest = RunTarget | { kind: 'resume'; run_id: string }

/**
 * Reads what followed `/luca-run`: `123`, `#123`, `demo`, or
 * `resume <run id>`.
 *
 * @example
 * parseRunArgs({ args: '#12' }) // { ok: true, target: { kind: 'spec', spec: 12 } }
 * parseRunArgs({ args: 'resume luca-20260928-124805-69hp' }) // { ok: true, target: { kind: 'resume', run_id: 'luca-20260928-124805-69hp' } }
 * parseRunArgs({ args: 'soon' }).ok // false
 */
export const parseRunArgs = ({
    args,
}: {
    args: string
}): { ok: true; target: RunRequest } | { ok: false; message: string } => {
    const text = args.trim()
    if (text.toLowerCase() === 'demo') {
        return { ok: true, target: { kind: 'demo' } }
    }
    const words = text.split(/\s+/)
    if (words[0]?.toLowerCase() === 'resume') {
        const run_id = words[1]
        return run_id !== undefined &&
            words.length === 2 &&
            !run_id.startsWith('-')
            ? { ok: true, target: { kind: 'resume', run_id } }
            : {
                  ok: false,
                  message: `Which run? Give its id, as the board shows it. Usage: ${RUN_USAGE}`,
              }
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
 * The Bun flags that keep the target repo's `.env` and `bunfig.toml` (and any
 * `preload` in it) out of the engine, which runs in the repo's folder: no env
 * file, and Luca's own bunfig, which ships next to the engine's entry.
 *
 * @example
 * isolationArgs({ engine_path: '/opt/luca/src/cli/luca-run.ts' })
 * // ['--no-env-file', '--config=/opt/luca/src/cli/bunfig.toml']
 */
const isolationArgs = ({ engine_path }: { engine_path: string }): string[] => [
    '--no-env-file',
    `--config=${join(dirname(engine_path), 'bunfig.toml')}`,
]

const NO_BUN = `Couldn't find Bun. Set the Bun path in Settings → Plugins → ${PLUGIN_ID}, or set LUCA_BUN.`

/**
 * Finds how to start the engine. The `engine_path` setting (run with Bun)
 * wins; else an installed `luca-run` command. Its real path (the bin is a
 * symlink to the engine's `luca-run.ts`) runs with Bun and the isolation
 * flags when Luca's bunfig is beside it; an older install without one runs
 * directly (it has a Bun shebang). Paths are absolute because Paseo swaps a
 * bare `bun` for its Node.
 *
 * @returns the command and the args that go before the run's own args, or a
 *   message that says what to set.
 */
export const resolveEngine = ({
    settings,
    env,
    home_dir,
    file_exists,
    real_path = ({ path }) => path,
}: {
    settings: EngineSettings
    env: Record<string, string | undefined>
    home_dir: string
    file_exists: ({ path }: { path: string }) => boolean
    /** Follows symlinks; the path as is when it can't. */
    real_path?: ({ path }: { path: string }) => string
}):
    | { ok: true; command: string; lead_args: string[] }
    | { ok: false; message: string } => {
    const bun = [
        settings.bun_path.trim(),
        env.LUCA_BUN ?? '',
        ...bunPaths({ home_dir }),
    ].find((path) => path.startsWith('/') && file_exists({ path }))
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
        if (!bun) return { ok: false, message: NO_BUN }
        return {
            ok: true,
            command: bun,
            lead_args: [...isolationArgs({ engine_path }), engine_path],
        }
    }
    const installed = installedCommandPaths({ home_dir }).find((path) =>
        file_exists({ path })
    )
    if (installed) {
        const entry = real_path({ path: installed })
        if (!file_exists({ path: join(dirname(entry), 'bunfig.toml') })) {
            return { ok: true, command: installed, lead_args: [] }
        }
        if (!bun) return { ok: false, message: NO_BUN }
        return {
            ok: true,
            command: bun,
            lead_args: [...isolationArgs({ engine_path: entry }), entry],
        }
    }
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
