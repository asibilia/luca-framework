import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { executeAction, startRun } from './execute'

import { createJournal, type Journal } from '../journal/journal'
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
