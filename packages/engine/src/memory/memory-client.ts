import { DEFAULT_MEMORY_TIMEOUT_MS, type MemoryHit } from './memory-schemas'

/**
 * The engine's line to **memory** (MuninnDB): an object of async functions,
 * like the tracker, so the real MCP client and the fake one for tests are
 * interchangeable. A client may throw or hang; the engine only ever calls it
 * through `safeMemory`, which never does.
 */
export type MemoryClient = {
    /** Searches one vault, best first. */
    recall: (args: {
        vault: string
        query: string
        limit: number
        /** The lowest score to give back. */
        threshold: number
    }) => Promise<MemoryHit[]>
    /** Adds a new memory. `op_id` makes a repeated call add it only once. */
    remember: (args: {
        vault: string
        type: string
        concept: string
        content: string
        summary: string
        tags: string[]
        op_id: string
    }) => Promise<{ id: string }>
    /** Updates a stored memory with new content. */
    evolve: (args: {
        vault: string
        id: string
        content: string
        reason: string
    }) => Promise<{ id: string }>
    /** Says whether a shown memory helped. */
    feedback: (args: {
        vault: string
        id: string
        useful: boolean
    }) => Promise<void>
    /** Closes the connection. */
    close: () => Promise<void>
}

/** A memory call's value, or why it failed. Never a throw. */
export type MemoryResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: string }

/** A memory client and how long each call may take, as `runEngine` takes them. */
export type MemoryDeps = {
    client: MemoryClient
    /** Defaults to `DEFAULT_MEMORY_TIMEOUT_MS`. */
    timeout_ms?: number
}

/** The client's calls, each one wrapped so it never throws or hangs. */
export type SafeMemory = {
    [Name in Exclude<keyof MemoryClient, 'close'>]: (
        args: Parameters<MemoryClient[Name]>[0]
    ) => Promise<MemoryResult<Awaited<ReturnType<MemoryClient[Name]>>>>
}

const errorText = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

/**
 * Runs one call and always comes back: a throw becomes an error value, and
 * a call past the timeout a timeout error, even if the call never settles.
 */
const withTimeout = async <T>({
    call,
    name,
    timeout_ms,
}: {
    call: () => Promise<T>
    name: string
    timeout_ms: number
}): Promise<MemoryResult<T>> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<MemoryResult<T>>((resolve) => {
        timer = setTimeout(
            () =>
                resolve({
                    ok: false,
                    error: `MuninnDB's ${name} did not answer within ${timeout_ms} ms.`,
                }),
            timeout_ms
        )
    })
    const called = Promise.resolve()
        .then(call)
        .then(
            (value): MemoryResult<T> => ({ ok: true, value }),
            (error: unknown): MemoryResult<T> => ({
                ok: false,
                error: `MuninnDB's ${name} failed: ${errorText(error)}`,
            })
        )
    try {
        return await Promise.race([called, timedOut])
    } finally {
        clearTimeout(timer)
    }
}

/**
 * The engine's side of memory: each call of `client` with a timeout
 * (default `DEFAULT_MEMORY_TIMEOUT_MS`), turning every error or timeout into
 * an error value. With no client (a run with memory on, resumed without
 * one), every call fails with a clear error. It never throws, so memory
 * never breaks a run.
 *
 * @example
 * const memory = safeMemory({ deps: { client: fakeMuninn } })
 * const found = await memory.recall({ vault: 'default', query: 'bun test', limit: 5, threshold: 0.5 })
 * if (!found.ok) console.error(found.error)
 */
export const safeMemory = ({
    deps,
}: {
    deps: MemoryDeps | undefined
}): SafeMemory => {
    const timeout_ms = deps?.timeout_ms ?? DEFAULT_MEMORY_TIMEOUT_MS
    const run = <T>(
        name: string,
        call: (client: MemoryClient) => Promise<T>
    ) => {
        const client = deps?.client
        if (client === undefined) {
            return Promise.resolve<MemoryResult<T>>({
                ok: false,
                error: 'The engine has no memory client for this run.',
            })
        }
        return withTimeout({ call: () => call(client), name, timeout_ms })
    }
    return {
        recall: (args) => run('recall', (client) => client.recall(args)),
        remember: (args) => run('remember', (client) => client.remember(args)),
        evolve: (args) => run('evolve', (client) => client.evolve(args)),
        feedback: (args) => run('feedback', (client) => client.feedback(args)),
    }
}
