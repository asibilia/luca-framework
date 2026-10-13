import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { resultJsonSchema } from './claude-options'
import { parseRoleResult, RoleResultSchema } from './role-results'

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

describe("parseRoleResult, the integration lens's Summary and Merge Danger (#513)", () => {
    const approve = { verdict: 'approve', findings: [], summary: 'Fits.' }
    const merge_danger = {
        door: 'one_way',
        door_reason: 'It publishes the package.',
        blast_radius: 'medium',
        blast_radius_reason: 'Every caller of sum.',
    }

    test('keeps the summary picture and the merge danger', () => {
        expect(
            parseRoleResult({
                role: 'integration-lens',
                output: {
                    ...approve,
                    summary_picture: '```\nsum()\n```',
                    merge_danger,
                },
            })
        ).toMatchObject({
            ok: true,
            value: {
                role: 'integration-lens',
                result: { summary_picture: '```\nsum()\n```', merge_danger },
            },
        })
    })

    test('an older result without them parses, with null for both', () => {
        const old = { role: 'integration-lens', result: approve }
        expect(
            parseRoleResult({ role: 'integration-lens', output: approve })
        ).toMatchObject({
            ok: true,
            value: { result: { summary_picture: null, merge_danger: null } },
        })
        expect(RoleResultSchema.parse(old)).toMatchObject({
            result: { summary_picture: null, merge_danger: null },
        })
    })

    test('the verdict must still match the findings', () => {
        expect(
            parseRoleResult({
                role: 'integration-lens',
                output: {
                    ...approve,
                    findings: [
                        {
                            id: 'I1',
                            severity: 'blocker',
                            kind: 'code',
                            title: 'Broken',
                        },
                    ],
                    merge_danger,
                },
            }).ok
        ).toBe(false)
    })

    test('a merge danger with an unknown door does not fit', () => {
        expect(
            parseRoleResult({
                role: 'integration-lens',
                output: {
                    ...approve,
                    merge_danger: { ...merge_danger, door: 'revolving' },
                },
            }).ok
        ).toBe(false)
    })
})

describe("the integration lens's structured output (#513)", () => {
    test('asks for the summary picture and the merge danger; the other lenses do not', () => {
        const fields = (role: 'integration-lens' | 'security-lens') =>
            Object.keys(
                z
                    .object({ properties: z.record(z.string(), z.unknown()) })
                    .parse(resultJsonSchema({ role })).properties
            )
        expect(fields('integration-lens')).toEqual(
            expect.arrayContaining(['summary_picture', 'merge_danger'])
        )
        expect(fields('security-lens')).not.toContain('merge_danger')
    })
})
