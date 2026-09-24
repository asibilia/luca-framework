import { describe, expect, test } from 'bun:test'

import { mergeRecalled, recallVaults } from './memory-recall'
import type { MemoryHit } from './memory-schemas'

const hit = (id: string, score: number): MemoryHit => ({
    id,
    concept: `pitfall:${id}`,
    content: `About ${id}.`,
    score,
    vector_score: null,
})

describe('recallVaults', () => {
    test('searches the project vault and default', () => {
        expect(recallVaults({ project_vault: 'luca-monorepo' })).toEqual([
            'luca-monorepo',
            'default',
        ])
    })

    test('searches only default with no project vault', () => {
        expect(recallVaults({ project_vault: null })).toEqual(['default'])
    })

    test('searches default once when the project vault is default', () => {
        expect(recallVaults({ project_vault: 'default' })).toEqual(['default'])
    })
})

describe('mergeRecalled', () => {
    test('merges both vaults by score, best first', () => {
        const merged = mergeRecalled({
            searches: [
                { vault: 'proj', hits: [hit('a', 0.9), hit('b', 0.6)] },
                { vault: 'default', hits: [hit('c', 1.4), hit('d', 0.7)] },
            ],
        })
        expect(merged.map(({ id, vault }) => `${vault}/${id}`)).toEqual([
            'default/c',
            'proj/a',
            'default/d',
            'proj/b',
        ])
        expect(merged[0]).toEqual({
            id: 'c',
            vault: 'default',
            concept: 'pitfall:c',
            content: 'About c.',
            score: 1.4,
        })
    })

    test('keeps at most 5', () => {
        const merged = mergeRecalled({
            searches: [
                {
                    vault: 'proj',
                    hits: ['a', 'b', 'c', 'd'].map((id, index) =>
                        hit(id, 0.9 - index / 100)
                    ),
                },
                {
                    vault: 'default',
                    hits: ['e', 'f', 'g'].map((id, index) =>
                        hit(id, 0.8 - index / 100)
                    ),
                },
            ],
        })
        expect(merged.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    })

    test('drops memories below the minimum score', () => {
        const merged = mergeRecalled({
            searches: [
                { vault: 'default', hits: [hit('a', 0.5), hit('b', 0.49)] },
            ],
        })
        expect(merged.map(({ id }) => id)).toEqual(['a'])
    })

    test('keeps one of a memory found twice in the same vault', () => {
        const merged = mergeRecalled({
            searches: [
                { vault: 'default', hits: [hit('a', 0.6), hit('a', 0.9)] },
                { vault: 'proj', hits: [hit('a', 0.7)] },
            ],
        })
        expect(
            merged.map(({ id, vault, score }) => [vault, id, score])
        ).toEqual([
            ['default', 'a', 0.9],
            ['proj', 'a', 0.7],
        ])
    })
})
