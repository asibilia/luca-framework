import { describe, expect, test } from 'bun:test'

import { parseRoleResult } from './role-results'

/**
 * The learner's result keeps each memory's scope (#406): this repo only
 * (`repo`) or useful anywhere (`anywhere`). A missing or unknown scope
 * still fits the schema, so the engine refuses and journals that one
 * memory instead of failing the learner's whole result.
 */

const memory = (fields: Record<string, unknown>) => ({
    type: 'pitfall',
    concept: 'bun-junit',
    content: 'Bun needs --reporter=junit.',
    summary: 'JUnit flags',
    ...fields,
})

describe("parseRoleResult, the learner's memories", () => {
    test('keeps each memory’s scope, repo-only or useful anywhere', () => {
        const checked = parseRoleResult({
            role: 'learner',
            output: {
                memories: [
                    memory({ concept: 'here', scope: 'repo' }),
                    memory({ concept: 'anywhere', scope: 'anywhere' }),
                ],
                helped: [],
            },
        })
        expect(checked).toMatchObject({
            ok: true,
            value: {
                role: 'learner',
                result: {
                    memories: [
                        { concept: 'here', scope: 'repo' },
                        { concept: 'anywhere', scope: 'anywhere' },
                    ],
                },
            },
        })
    })

    test('a memory with a missing or unknown scope still fits, so it can be refused on its own', () => {
        const checked = parseRoleResult({
            role: 'learner',
            output: {
                memories: [
                    memory({ concept: 'no-scope' }),
                    memory({ concept: 'odd', scope: 'everywhere' }),
                ],
                helped: [],
            },
        })
        expect(checked).toMatchObject({
            ok: true,
            value: {
                result: {
                    memories: [
                        { concept: 'no-scope' },
                        { concept: 'odd', scope: 'everywhere' },
                    ],
                },
            },
        })
    })
})
