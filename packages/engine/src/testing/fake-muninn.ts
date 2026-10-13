import orderBy from 'lodash/orderBy'

import type { MemoryClient } from '../memory/memory-client'
import type { MemoryHit } from '../memory/memory-schemas'

/**
 * A fake MuninnDB for tests and the demo: vaults in memory, seeded with
 * memories that carry scripted scores. It records every call, and can be
 * told to fail or hang, per vault and per operation. Nothing leaves the
 * process; no test ever touches the real server.
 */

/** A memory in a fake vault, with the scores every search gives it. */
export type FakeMemory = {
    id: string
    concept: string
    content: string
    type?: string
    summary?: string
    tags?: string[]
    /** The relevance score a search gives it. Defaults to 1. */
    score?: number
    /** How close its meaning is to a search. Defaults to `null`. */
    vector_score?: number | null
    /**
     * Only a search whose query holds this text (any case) finds it.
     * Leave it out to be found by every search.
     */
    match?: string
}

/** The fake's operations, as the engine calls them. */
export type FakeMuninnOp = 'recall' | 'remember' | 'evolve' | 'feedback'

/** One call the fake got, with its arguments. */
export type FakeMuninnCall = {
    op: FakeMuninnOp
    vault: string
    args: Record<string, unknown>
}

/** Which calls fail or hang: every call, or those of a vault or an operation. */
export type FakeMuninnRule = { vault?: string; op?: FakeMuninnOp }

export type FakeMuninn = MemoryClient & {
    /** Every call so far, oldest first. */
    calls: () => FakeMuninnCall[]
    /** A vault's memories now. */
    stored: (vault: string) => FakeMemory[]
    /** Whether `close` was called. */
    closed: () => boolean
}

const applies = ({
    rules,
    op,
    vault,
}: {
    rules: FakeMuninnRule[]
    op: FakeMuninnOp
    vault: string
}): boolean =>
    rules.some(
        (rule) =>
            (rule.op === undefined || rule.op === op) &&
            (rule.vault === undefined || rule.vault === vault)
    )

/**
 * A fake MuninnDB. A search gives back the vault's memories that match its
 * query, with their scripted scores, at or above its threshold, best first,
 * at most `limit`. `remember` adds a memory (`fake-<n>`; the same `op_id`
 * twice adds it once), `evolve` replaces a memory's content and keeps its
 * id, and `feedback` records the call. A call matching a `fail` rule
 * throws; one matching a `hang` rule never settles.
 *
 * @example
 * const muninn = createFakeMuninn({
 *     vaults: { default: [{ id: 'm1', concept: 'pitfall:bun-junit', content: '...', score: 0.9 }] },
 *     fail: [{ vault: 'luca-monorepo' }],
 * })
 */
export const createFakeMuninn = ({
    vaults,
    fail,
    hang,
}: {
    vaults?: Record<string, FakeMemory[]>
    fail?: FakeMuninnRule[]
    hang?: FakeMuninnRule[]
} = {}): FakeMuninn => {
    const store = new Map<string, FakeMemory[]>(
        Object.entries(vaults ?? {}).map(([vault, memories]) => [
            vault,
            memories.map((memory) => ({ ...memory })),
        ])
    )
    const ops = new Map<string, string>()
    const calls: FakeMuninnCall[] = []
    let added = 0
    let closed = false

    const call = async <T>({
        op,
        vault,
        args,
        run,
    }: {
        op: FakeMuninnOp
        vault: string
        args: Record<string, unknown>
        run: () => T
    }): Promise<T> => {
        calls.push({ op, vault, args })
        if (applies({ rules: hang ?? [], op, vault })) {
            return new Promise<T>(() => undefined)
        }
        if (applies({ rules: fail ?? [], op, vault })) {
            throw new Error(`The fake MuninnDB fails ${op} in ${vault}.`)
        }
        return run()
    }

    const vaultOf = (vault: string): FakeMemory[] => store.get(vault) ?? []

    return {
        recall: (args) =>
            call({
                op: 'recall',
                vault: args.vault,
                args,
                run: (): MemoryHit[] => {
                    const query = args.query.toLowerCase()
                    const found = vaultOf(args.vault)
                        .filter(
                            ({ match }) =>
                                match === undefined ||
                                query.includes(match.toLowerCase())
                        )
                        .map(
                            ({
                                id,
                                concept,
                                content,
                                score,
                                vector_score,
                            }) => ({
                                id,
                                concept,
                                content,
                                score: score ?? 1,
                                vector_score: vector_score ?? null,
                            })
                        )
                        .filter(({ score }) => score >= args.threshold)
                    return orderBy(found, ['score'], ['desc']).slice(
                        0,
                        args.limit
                    )
                },
            }),
        remember: (args) =>
            call({
                op: 'remember',
                vault: args.vault,
                args,
                run: () => {
                    const known = ops.get(args.op_id)
                    if (known !== undefined) return { id: known }
                    added += 1
                    const id = `fake-${added}`
                    ops.set(args.op_id, id)
                    store.set(args.vault, [
                        ...vaultOf(args.vault),
                        {
                            id,
                            concept: args.concept,
                            content: args.content,
                            type: args.type,
                            summary: args.summary,
                            tags: args.tags,
                            score: 0,
                        },
                    ])
                    return { id }
                },
            }),
        evolve: (args) =>
            call({
                op: 'evolve',
                vault: args.vault,
                args,
                run: () => {
                    store.set(
                        args.vault,
                        vaultOf(args.vault).map((memory) =>
                            memory.id === args.id
                                ? { ...memory, content: args.content }
                                : memory
                        )
                    )
                    return { id: args.id }
                },
            }),
        feedback: (args) =>
            call({
                op: 'feedback',
                vault: args.vault,
                args,
                run: () => undefined,
            }),
        close: async () => {
            closed = true
        },
        calls: () => [...calls],
        stored: (vault) => vaultOf(vault).map((memory) => ({ ...memory })),
        closed: () => closed,
    }
}
