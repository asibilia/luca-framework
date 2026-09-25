import { describe, expect, test } from 'bun:test'

import { memoryFeedback, routeMemories, storedConcept } from './memory-routing'

/** A proposed memory; `scope` defaults to useful anywhere. */
const proposal = (type: string, concept: string, scope = 'anywhere') => ({
    type,
    concept,
    content: `The lesson of ${concept}.`,
    summary: `${concept} in short.`,
    scope,
})

describe('routeMemories', () => {
    test('routes pattern, pitfall, and procedure to default, and decision to the project vault', () => {
        const routed = routeMemories({
            proposals: [
                proposal('pattern', 'object-args'),
                proposal('pitfall', 'bun-junit'),
                proposal('procedure', 'release'),
                proposal('decision', 'memory-engine-only', 'repo'),
            ],
            project_vault: 'luca-monorepo',
        })
        expect(routed.refused).toEqual([])
        expect(routed.saves).toEqual([
            {
                type: 'pattern',
                vault: 'default',
                concept: 'pattern:object-args',
                content: 'The lesson of object-args.',
                summary: 'object-args in short.',
            },
            {
                type: 'pitfall',
                vault: 'default',
                concept: 'pitfall:bun-junit',
                content: 'The lesson of bun-junit.',
                summary: 'bun-junit in short.',
            },
            {
                type: 'procedure',
                vault: 'default',
                concept: 'procedure:release',
                content: 'The lesson of release.',
                summary: 'release in short.',
            },
            {
                type: 'decision',
                vault: 'luca-monorepo',
                concept: 'decision:memory-engine-only',
                content: 'The lesson of memory-engine-only.',
                summary: 'memory-engine-only in short.',
            },
        ])
    })

    test('refuses an unknown type, with the reason', () => {
        const routed = routeMemories({
            proposals: [proposal('session', 'today'), proposal('pitfall', 'x')],
            project_vault: 'proj',
        })
        expect(routed.saves.map(({ concept }) => concept)).toEqual([
            'pitfall:x',
        ])
        expect(routed.refused).toEqual([
            {
                type: 'session',
                concept: 'today',
                reason: 'Unknown memory type "session": only pattern, pitfall, procedure, and decision are saved.',
            },
        ])
    })

    test('refuses a decision when the config names no project vault', () => {
        const routed = routeMemories({
            proposals: [proposal('decision', 'x')],
            project_vault: null,
        })
        expect(routed.saves).toEqual([])
        expect(routed.refused).toEqual([
            {
                type: 'decision',
                concept: 'x',
                reason: 'A decision goes to the project vault, and the engine config names none (muninn.vault).',
            },
        ])
    })

    test('reads the type without case or spaces, and keeps a concept that already has its type', () => {
        const routed = routeMemories({
            proposals: [proposal(' Pitfall ', 'pitfall:bun-junit')],
            project_vault: null,
        })
        expect(routed.saves[0]?.type).toBe('pitfall')
        expect(routed.saves[0]?.concept).toBe('pitfall:bun-junit')
    })

    test('routes repo-only patterns, pitfalls, and procedures to the project vault', () => {
        const routed = routeMemories({
            proposals: [
                proposal('pattern', 'board-rows', 'repo'),
                proposal('pitfall', 'engine-readme-guard-docs', 'repo'),
                proposal('procedure', 'luca-run', 'repo'),
            ],
            project_vault: 'luca-monorepo',
        })
        expect(routed.refused).toEqual([])
        expect(
            routed.saves.map(({ concept, vault }) => ({ concept, vault }))
        ).toEqual([
            { concept: 'pattern:board-rows', vault: 'luca-monorepo' },
            {
                concept: 'pitfall:engine-readme-guard-docs',
                vault: 'luca-monorepo',
            },
            { concept: 'procedure:luca-run', vault: 'luca-monorepo' },
        ])
    })

    test('routes the same type by its scope: repo-only to the project vault, useful anywhere to default', () => {
        const routed = routeMemories({
            proposals: [
                proposal('pitfall', 'only-here', 'repo'),
                proposal('pitfall', 'everywhere', 'anywhere'),
            ],
            project_vault: 'proj',
        })
        expect(routed.refused).toEqual([])
        expect(
            routed.saves.map(({ concept, vault }) => ({ concept, vault }))
        ).toEqual([
            { concept: 'pitfall:only-here', vault: 'proj' },
            { concept: 'pitfall:everywhere', vault: 'default' },
        ])
    })

    test('a decision always goes to the project vault whatever its scope, while scope decides the other types', () => {
        const routed = routeMemories({
            proposals: [
                proposal('decision', 'markers', 'anywhere'),
                proposal('decision', 'engine-only-memory', 'repo'),
                proposal('pattern', 'board-rows', 'repo'),
                proposal('pattern', 'object-args', 'anywhere'),
            ],
            project_vault: 'proj',
        })
        expect(routed.refused).toEqual([])
        expect(
            routed.saves.map(({ concept, vault }) => ({ concept, vault }))
        ).toEqual([
            { concept: 'decision:markers', vault: 'proj' },
            { concept: 'decision:engine-only-memory', vault: 'proj' },
            { concept: 'pattern:board-rows', vault: 'proj' },
            { concept: 'pattern:object-args', vault: 'default' },
        ])
    })

    test('refuses a memory with no scope, with the reason, and saves the rest', () => {
        const routed = routeMemories({
            proposals: [
                {
                    type: 'pitfall',
                    concept: 'no-scope',
                    content: 'The lesson of no-scope.',
                    summary: 'no-scope in short.',
                },
                proposal('pattern', 'fine'),
            ],
            project_vault: 'proj',
        })
        expect(routed.saves.map(({ concept }) => concept)).toEqual([
            'pattern:fine',
        ])
        expect(routed.refused).toEqual([
            {
                type: 'pitfall',
                concept: 'no-scope',
                reason: expect.stringContaining('scope'),
            },
        ])
    })

    test('refuses a memory with an unknown scope, naming it, instead of guessing a vault', () => {
        const routed = routeMemories({
            proposals: [proposal('procedure', 'release', 'everywhere')],
            project_vault: 'proj',
        })
        expect(routed.saves).toEqual([])
        expect(routed.refused).toEqual([
            {
                type: 'procedure',
                concept: 'release',
                reason: expect.stringContaining('"everywhere"'),
            },
        ])
        expect(routed.refused[0]?.reason).toContain('scope')
    })

    test('refuses a repo-only memory when the config names no project vault', () => {
        const routed = routeMemories({
            proposals: [
                proposal('pitfall', 'only-here', 'repo'),
                proposal('pitfall', 'everywhere'),
            ],
            project_vault: null,
        })
        expect(
            routed.saves.map(({ concept, vault }) => ({ concept, vault }))
        ).toEqual([{ concept: 'pitfall:everywhere', vault: 'default' }])
        expect(routed.refused).toEqual([
            {
                type: 'pitfall',
                concept: 'only-here',
                reason: expect.stringContaining('muninn.vault'),
            },
        ])
    })
})

describe('storedConcept', () => {
    test('puts the type in front', () => {
        expect(storedConcept({ type: 'pattern', concept: 'x' })).toBe(
            'pattern:x'
        )
    })
})

describe('memoryFeedback', () => {
    const shown = [
        { id: 'm1', vault: 'default', concept: 'a', content: 'a', score: 1 },
        { id: 'm2', vault: 'proj', concept: 'b', content: 'b', score: 1 },
        { id: 'm1', vault: 'default', concept: 'a', content: 'a', score: 0.7 },
    ]

    test('marks each distinct shown memory useful when the learner said it helped', () => {
        expect(memoryFeedback({ shown, helped: ['m2'] })).toEqual([
            { id: 'm1', vault: 'default', useful: false },
            { id: 'm2', vault: 'proj', useful: true },
        ])
    })

    test('ignores ids that were never shown', () => {
        expect(memoryFeedback({ shown, helped: ['m9', 'm1'] })).toEqual([
            { id: 'm1', vault: 'default', useful: true },
            { id: 'm2', vault: 'proj', useful: false },
        ])
    })
})
