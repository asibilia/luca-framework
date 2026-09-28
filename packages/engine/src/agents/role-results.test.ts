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

describe("parseRoleResult, a test-writer's already_done (#484)", () => {
    const criteria = [
        {
            criterion_id: 'AC1',
            tests: [{ file: 'src/sum.test.ts', name: 'sum adds two numbers' }],
        },
    ]

    test('keeps the commits that did the work and the tests that cover each criterion', () => {
        expect(
            parseRoleResult({
                role: 'test-writer',
                output: {
                    outcome: 'already_done',
                    done_by: [{ sha: '3559c25f5', title: 'feat: add sum' }],
                    criteria,
                    summary: 'Already on main.',
                },
            })
        ).toMatchObject({
            ok: true,
            value: {
                result: {
                    outcome: 'already_done',
                    done_by: [{ sha: '3559c25f5', title: 'feat: add sum' }],
                    criteria,
                },
            },
        })
    })

    test('without a commit, or without the tests, it is no answer', () => {
        const noCommit = parseRoleResult({
            role: 'test-writer',
            output: { outcome: 'already_done', done_by: [], criteria },
        })
        expect(noCommit.ok).toBe(false)
        if (!noCommit.ok) expect(noCommit.error).toContain('done_by')

        const noTests = parseRoleResult({
            role: 'test-writer',
            output: {
                outcome: 'already_done',
                done_by: [{ sha: '3559c25f5' }],
            },
        })
        expect(noTests.ok).toBe(false)
        if (!noTests.ok) expect(noTests.error).toContain('criteria')
    })
})
