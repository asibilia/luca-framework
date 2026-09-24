import { describe, expect, test } from 'bun:test'

import { memoryFeedback, routeMemories, storedConcept } from './memory-routing'

const proposal = (type: string, concept: string) => ({
    type,
    concept,
    content: `The lesson of ${concept}.`,
    summary: `${concept} in short.`,
})

describe('routeMemories', () => {
    test('routes pattern, pitfall, and procedure to default, and decision to the project vault', () => {
        const routed = routeMemories({
            proposals: [
                proposal('pattern', 'object-args'),
                proposal('pitfall', 'bun-junit'),
                proposal('procedure', 'release'),
                proposal('decision', 'memory-engine-only'),
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
