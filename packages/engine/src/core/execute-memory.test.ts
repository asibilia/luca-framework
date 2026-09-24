import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { executeAction, startRun } from './execute'

import { createJournal, type Journal } from '../journal/journal'
import type { MemorySave } from '../memory/memory-schemas'
import { BUILD_CONFIG } from '../testing/build-fixtures'
import { createFakeMuninn } from '../testing/fake-muninn'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'

/**
 * Memory's searches as the executor carries them out (#370): both vaults,
 * merged by score, at most 5, above the minimum score, and journaled with
 * each vault's outcome.
 */

let root = ''
let journal: Journal

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-execute-memory-'))
    journal = createJournal({ file: join(root, 'journal.jsonl') })
    startRun({
        journal,
        spec_number: 10,
        config: BUILD_CONFIG,
        memory: { project_vault: 'proj' },
    })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const memoryOf = (id: string, score: number) => ({
    id,
    concept: `pitfall:${id}`,
    content: `About ${id}.`,
    score,
})

describe('recall_memories', () => {
    test('searches both vaults and keeps the 5 best above the minimum score', async () => {
        const muninn = createFakeMuninn({
            vaults: {
                proj: [
                    memoryOf('p1', 1.4),
                    memoryOf('p2', 0.9),
                    memoryOf('p3', 0.55),
                    memoryOf('p4', 0.2),
                ],
                default: [
                    memoryOf('d1', 1.1),
                    memoryOf('d2', 0.8),
                    memoryOf('d3', 0.6),
                    memoryOf('d4', 0.51),
                ],
            },
        })
        await executeAction({
            action: {
                type: 'recall_memories',
                point: 'ticket',
                ticket: 11,
                key: 'ticket:11',
                query: 'Add sum',
            },
            journal,
            tracker: createInMemoryTracker({ issues: [], sub_tickets: {} }),
            memory: { client: muninn },
        })

        const recalled = journal.read().at(-1)
        expect(recalled).toMatchObject({
            kind: 'memory_recalled',
            ticket: 11,
            content: {
                point: 'ticket',
                key: 'ticket:11',
                query: 'Add sum',
                vaults: [
                    { vault: 'proj', ok: true, error: null, found: 3 },
                    { vault: 'default', ok: true, error: null, found: 4 },
                ],
            },
        })
        const memories =
            recalled?.kind === 'memory_recalled'
                ? recalled.content.memories
                : []
        expect(
            memories.map(({ vault, id, score }) => [vault, id, score])
        ).toEqual([
            ['proj', 'p1', 1.4],
            ['default', 'd1', 1.1],
            ['proj', 'p2', 0.9],
            ['default', 'd2', 0.8],
            ['default', 'd3', 0.6],
        ])
        expect(
            muninn
                .calls()
                .map(({ vault, args }) => [vault, args.limit, args.threshold])
        ).toEqual([
            ['proj', 5, 0.5],
            ['default', 5, 0.5],
        ])
    })
})

/**
 * The learner's saves and feedback across crashes (#369): each MuninnDB
 * write is journaled before (`memory_write_started`) and after
 * (`memory_write_done`), so a redo of the step skips what was done, repeats
 * a save in doubt the same way, and never sends a feedback in doubt again.
 */
describe('save_memories redone after a crash', () => {
    const SAVE_ACTION = {
        type: 'save_memories' as const,
        saves: [
            {
                type: 'pitfall',
                vault: 'default',
                concept: 'pitfall:bun-junit',
                content: 'Bun needs --reporter=junit.',
                summary: 'JUnit flags',
                op_id: 'op-1',
                tags: ['luca', 'spec-10'],
            },
            {
                type: 'decision',
                vault: 'proj',
                concept: 'decision:engine-owns-memory',
                content: 'Only the engine talks to MuninnDB.',
                summary: 'Engine-only memory',
                op_id: 'op-2',
                tags: ['luca', 'spec-10'],
            },
            {
                type: 'decision',
                vault: 'proj',
                concept: 'decision:markers',
                content: 'Engine comments carry a marker.',
                summary: 'Markers',
                op_id: 'op-3',
                tags: ['luca', 'spec-10'],
            },
        ],
        refused: [
            { type: 'session', concept: 'today', reason: 'Unknown type.' },
        ],
        feedback: [
            { id: 'd-junit', vault: 'default', useful: true },
            { id: 'p-old', vault: 'proj', useful: false },
        ],
    }

    const seeded = () =>
        createFakeMuninn({
            vaults: {
                default: [
                    {
                        id: 'd-junit',
                        concept: 'pitfall:bun-junit',
                        content: 'Old text.',
                        score: 0.6,
                        vector_score: 0.92,
                    },
                ],
                proj: [],
            },
        })

    /**
     * The journal, but the `nth` append of `kind` (counted from when it was
     * made) throws instead, as if the engine died just before journaling it.
     */
    const crashingOn = ({
        kind,
        nth,
    }: {
        kind: string
        nth: number
    }): Journal => {
        let seen = 0
        return {
            ...journal,
            append: (entry) => {
                if (entry.kind === kind) {
                    seen += 1
                    if (seen === nth) throw new Error('The engine crashed.')
                }
                return journal.append(entry)
            },
        }
    }

    const tracker = () => createInMemoryTracker({ issues: [], sub_tickets: {} })

    /** The step's first try: its `step_started`, then the save, cut off. */
    const firstTry = async ({
        muninn,
        kind,
        nth,
    }: {
        muninn: ReturnType<typeof createFakeMuninn>
        kind: string
        nth: number
    }): Promise<number> => {
        const started = journal.append({
            kind: 'step_started',
            ticket: null,
            role: null,
            content: { key: 'run', step: 'save_memories', first_seq: null },
        })
        await expect(
            executeAction({
                action: SAVE_ACTION,
                journal: crashingOn({ kind, nth }),
                tracker: tracker(),
                memory: { client: muninn },
                step: { first_seq: started.seq, redo: false },
            })
        ).rejects.toThrow('The engine crashed.')
        return started.seq
    }

    const redo = async ({
        muninn,
        first_seq,
        crash,
    }: {
        muninn: ReturnType<typeof createFakeMuninn>
        first_seq: number
        crash?: { kind: string; nth: number }
    }) =>
        executeAction({
            action: SAVE_ACTION,
            journal: crash === undefined ? journal : crashingOn(crash),
            tracker: tracker(),
            memory: { client: muninn },
            step: { first_seq, redo: true },
        })

    const saved = () =>
        journal
            .read()
            .flatMap((record) =>
                record.kind === 'memories_saved' ? [record.content] : []
            )

    const EXPECTED_SAVES: Pick<MemorySave, 'concept' | 'outcome' | 'id'>[] = [
        { concept: 'today', outcome: 'refused', id: null },
        { concept: 'pitfall:bun-junit', outcome: 'updated', id: 'd-junit' },
        {
            concept: 'decision:engine-owns-memory',
            outcome: 'added',
            id: 'fake-1',
        },
        { concept: 'decision:markers', outcome: 'added', id: 'fake-2' },
    ]

    const callsOf = (
        muninn: ReturnType<typeof createFakeMuninn>,
        from: number
    ) =>
        muninn
            .calls()
            .slice(from)
            .map(({ op, vault, args }) => [
                op,
                vault,
                args.op_id ?? args.id ?? args.query,
            ])

    test('journals each write before and after it, then memories_saved', async () => {
        const muninn = seeded()
        await executeAction({
            action: SAVE_ACTION,
            journal,
            tracker: tracker(),
            memory: { client: muninn },
        })
        const writes = journal
            .read()
            .flatMap((record) =>
                record.kind === 'memory_write_started' ||
                record.kind === 'memory_write_done'
                    ? [[record.kind, record.content.write_key]]
                    : []
            )
        expect(writes).toEqual([
            ['memory_write_started', 'save:op-1'],
            ['memory_write_done', 'save:op-1'],
            ['memory_write_started', 'save:op-2'],
            ['memory_write_done', 'save:op-2'],
            ['memory_write_started', 'save:op-3'],
            ['memory_write_done', 'save:op-3'],
            ['memory_write_started', 'feedback:default:d-junit'],
            ['memory_write_done', 'feedback:default:d-junit'],
            ['memory_write_started', 'feedback:proj:p-old'],
            ['memory_write_done', 'feedback:proj:p-old'],
        ])
        expect(journal.read().at(-1)?.kind).toBe('memories_saved')
        expect(
            journal.read().find(({ kind }) => kind === 'memory_write_started')
                ?.content
        ).toEqual({
            write_key: 'save:op-1',
            what: 'save',
            vault: 'default',
            concept: 'pitfall:bun-junit',
            op_id: 'op-1',
            update_id: 'd-junit',
            similar: { id: 'd-junit', score: 0.6, vector_score: 0.92 },
        })
    })

    test('an update and an add in doubt are repeated the same way, and nothing done is done again', async () => {
        const muninn = seeded()
        // Cut off after the update, before it was journaled done.
        const first_seq = await firstTry({
            muninn,
            kind: 'memory_write_done',
            nth: 1,
        })
        // The redo repeats the update, then is cut off after the first add.
        const before = muninn.calls().length
        await expect(
            redo({
                muninn,
                first_seq,
                crash: { kind: 'memory_write_done', nth: 2 },
            })
        ).rejects.toThrow('The engine crashed.')
        expect(callsOf(muninn, before)).toEqual([
            ['evolve', 'default', 'd-junit'],
            ['recall', 'proj', expect.stringContaining('engine-owns-memory')],
            ['remember', 'proj', 'op-2'],
        ])

        // The next redo repeats only the add in doubt, by its op id.
        const again = muninn.calls().length
        await redo({ muninn, first_seq })
        expect(callsOf(muninn, again)).toEqual([
            ['remember', 'proj', 'op-2'],
            ['recall', 'proj', expect.stringContaining('decision:markers')],
            ['remember', 'proj', 'op-3'],
            ['feedback', 'default', 'd-junit'],
            ['feedback', 'proj', 'p-old'],
        ])
        expect(muninn.stored('proj').map(({ concept }) => concept)).toEqual([
            'decision:engine-owns-memory',
            'decision:markers',
        ])
        const [content] = saved()
        expect(saved()).toHaveLength(1)
        expect(
            content?.saves.map(({ concept, outcome, id }) => ({
                concept,
                outcome,
                id,
            }))
        ).toEqual(EXPECTED_SAVES)
        expect(content?.feedback.every(({ ok }) => ok)).toBe(true)
    })

    test('a feedback in doubt is not sent again, and is journaled as not ok', async () => {
        const muninn = seeded()
        const first_seq = await firstTry({
            muninn,
            kind: 'memory_write_done',
            nth: 4,
        })
        const before = muninn.calls().length
        await redo({ muninn, first_seq })

        expect(callsOf(muninn, before)).toEqual([['feedback', 'proj', 'p-old']])
        const feedback = muninn
            .calls()
            .filter(({ op }) => op === 'feedback')
            .map(({ args }) => args.id)
        expect(feedback).toEqual(['d-junit', 'p-old'])
        const [content] = saved()
        expect(content?.feedback).toEqual([
            {
                id: 'd-junit',
                vault: 'default',
                useful: true,
                ok: false,
                error: expect.stringContaining('unknown: a crash cut it off'),
            },
            {
                id: 'p-old',
                vault: 'proj',
                useful: false,
                ok: true,
                error: null,
            },
        ])
        expect(
            content?.saves.map(({ concept, outcome, id }) => ({
                concept,
                outcome,
                id,
            }))
        ).toEqual(EXPECTED_SAVES)
    })

    test('cut off after every write, the redo calls MuninnDB for nothing and journals memories_saved once', async () => {
        const muninn = seeded()
        const first_seq = await firstTry({
            muninn,
            kind: 'memories_saved',
            nth: 1,
        })
        const before = muninn.calls().length
        await redo({ muninn, first_seq })

        expect(muninn.calls().length).toBe(before)
        expect(saved()).toHaveLength(1)
        expect(
            saved()[0]?.saves.map(({ concept, outcome, id }) => ({
                concept,
                outcome,
                id,
            }))
        ).toEqual(EXPECTED_SAVES)
        expect(saved()[0]?.feedback.every(({ ok }) => ok)).toBe(true)
    })

    test("a first try's writes don't count for a later step's first try", async () => {
        const muninn = seeded()
        await firstTry({ muninn, kind: 'memories_saved', nth: 1 })
        // A step that is not a redo, numbered after every record so far.
        const before = muninn.calls().length
        await executeAction({
            action: SAVE_ACTION,
            journal,
            tracker: tracker(),
            memory: { client: muninn },
        })
        expect(
            muninn
                .calls()
                .slice(before)
                .filter(({ op }) => op === 'feedback')
        ).toHaveLength(2)
    })
})
