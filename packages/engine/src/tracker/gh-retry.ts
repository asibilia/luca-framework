/**
 * Retries for `gh` calls (#569). A call that fails in a way likely to pass
 * on a second try (a timeout, a cut-off JSON reply, a 5xx, a secondary rate
 * limit, a dropped connection or a TLS error) is tried again, three tries in
 * all, after waits of 2 s then 8 s. Any other failure throws at once. Each
 * retry is logged to the run log.
 */
import { TrackerError } from './tracker'

import {
    durationText,
    runCommand,
    type CommandResult,
} from '../shell/run-command'

/**
 * Runs `gh` with `args` and collects its output. Never throws on a non-zero
 * exit. The GitHub tracker makes every call through one, so tests can fake
 * `gh`.
 */
export type GhRunner = (args: string[]) => Promise<
    Pick<CommandResult, 'exit_code' | 'stdout' | 'stderr'> & {
        timed_out?: boolean
    }
>

/** A `gh` call that runs longer is stopped, and counts as transient. */
export const GH_TIMEOUT_MS = 60_000

/** The waits before the second and third tries. */
export const GH_RETRY_WAITS_MS = [2_000, 8_000]

/** How waits and retry lines happen; tests fake both. */
export type GhRetryDeps = {
    sleep: (ms: number) => Promise<void>
    log: (line: string) => void
}

export const realRetryDeps: GhRetryDeps = {
    sleep: (ms) => Bun.sleep(ms),
    log: (line) => {
        console.log(line)
    },
}

/** The real `gh`, on the `PATH`, run in `cwd` (default: the engine's). */
export const realGh =
    ({ cwd }: { cwd?: string } = {}): GhRunner =>
    (args) =>
        runCommand({
            cmd: ['gh', ...args],
            cwd: cwd ?? process.cwd(),
            timeout_ms: GH_TIMEOUT_MS,
        })

/** A failed `gh` call likely to pass on a second try. */
export class TransientGhError extends TrackerError {}

/** What `gh` says when a call fails in a way likely to pass next time. */
const TRANSIENT_STDERR = [
    /unexpected end of JSON input/i,
    /unexpected EOF/i,
    /HTTP 5\d\d/,
    /secondary rate limit/i,
    /connection (reset|refused|timed out)/i,
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT/,
    /i\/o timeout|deadline exceeded|timeout exceeded/i,
    /\bTLS\b/i,
]

const NOT_FOUND = /HTTP 404\b/

/** A failed `gh` call as a `TrackerError`, in `gh`'s own words. */
const ghError = ({
    args,
    result,
}: {
    args: string[]
    result: Awaited<ReturnType<GhRunner>>
}): TrackerError => {
    const what = `\`gh ${args.slice(0, 2).join(' ')}\``
    if (result.timed_out === true) {
        return new TransientGhError(
            `${what} failed (timed out after ${durationText(GH_TIMEOUT_MS)})`
        )
    }
    const message = `${what} failed (exit code ${result.exit_code}): ${result.stderr.trim()}`
    return TRANSIENT_STDERR.some((pattern) => pattern.test(result.stderr))
        ? new TransientGhError(message)
        : new TrackerError(message)
}

/**
 * Runs `attempt` until it succeeds, it fails in a way that isn't transient,
 * or the tries run out; then throws its last error. Before a retry,
 * `landed` (for writes) looks for what the earlier try may have left: when
 * it finds it, that is the answer and nothing is tried again.
 */
export const withRetries = async <T>({
    attempt,
    landed,
    sleep,
    log,
}: GhRetryDeps & {
    attempt: () => Promise<T>
    landed?: () => Promise<T | null>
}): Promise<T> => {
    for (let tries = 1; ; tries += 1) {
        try {
            return await attempt()
        } catch (error) {
            const wait = GH_RETRY_WAITS_MS[tries - 1]
            if (!(error instanceof TransientGhError) || wait === undefined) {
                throw error
            }
            log(
                `[tracker] ${error.message}; trying again in ${durationText(wait)} (try ${tries + 1} of ${GH_RETRY_WAITS_MS.length + 1})`
            )
            await sleep(wait)
            const earlier = landed === undefined ? null : await landed()
            if (earlier !== null) return earlier
        }
    }
}

/**
 * The `gh` calls the tracker makes, each with retries:
 * - `ok` returns the output, and throws when the call fails;
 * - `read` parses the output with `parse`; output that doesn't parse as
 *   JSON counts as a cut-off reply, so as transient;
 * - `api` reads `gh api <path>` as JSON, and is `null` only for a 404.
 */
export const createGhCalls = ({
    run,
    sleep,
    log,
}: GhRetryDeps & { run: GhRunner }) => {
    const once = async ({
        args,
        not_found_null,
    }: {
        args: string[]
        not_found_null: boolean
    }): Promise<string | null> => {
        const result = await run(args)
        if (result.exit_code === 0 && result.timed_out !== true) {
            return result.stdout
        }
        if (not_found_null && NOT_FOUND.test(result.stderr)) return null
        throw ghError({ args, result })
    }

    const parsed = <T>({
        args,
        stdout,
        parse,
    }: {
        args: string[]
        stdout: string
        parse: (stdout: string) => T
    }): T => {
        try {
            return parse(stdout)
        } catch (error) {
            if (!(error instanceof SyntaxError)) throw error
            throw new TransientGhError(
                `\`gh ${args.slice(0, 2).join(' ')}\` failed (a cut-off reply: ${error.message})`
            )
        }
    }

    const read = <T>({
        args,
        parse,
        landed,
    }: {
        args: string[]
        parse: (stdout: string) => T
        landed?: () => Promise<T | null>
    }): Promise<T> =>
        withRetries({
            attempt: async () =>
                parsed({
                    args,
                    stdout: (await once({ args, not_found_null: false })) ?? '',
                    parse,
                }),
            landed,
            sleep,
            log,
        })

    return {
        read,
        ok: ({
            args,
            landed,
        }: {
            args: string[]
            landed?: () => Promise<string | null>
        }): Promise<string> =>
            read({ args, parse: (stdout) => stdout, landed }),
        api: ({ path }: { path: string }): Promise<unknown> => {
            const args = ['api', path]
            return withRetries({
                attempt: async () => {
                    const stdout = await once({ args, not_found_null: true })
                    return stdout === null
                        ? null
                        : parsed({ args, stdout, parse: JSON.parse })
                },
                sleep,
                log,
            })
        },
    }
}
