import { describe, expect, test } from 'bun:test'

import { roleInstructions } from './role-instructions'
import { parseRoleResult } from './role-results'

import type { JournalEntry } from '../journal/journal-record'
import { recordsFrom } from '../testing/intake-fixtures'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

/**
 * The writers' `environment` answer (#613): its result, its prompt lines,
 * and its journal records. The decision steps it leads to are tested in
 * `core/decide-environment.test.ts` and
 * `core/decide-final-environment.test.ts`.
 */

const EVIDENCE =
    'EADDRINUSE on port 4000: another ticket holds the port. I changed nothing.'

const WRITERS = ['test-writer', 'implementer'] as const

describe('an environment result (#613)', () => {
    test('fits with non-empty evidence, and is refused without it or with it empty', () => {
        for (const role of WRITERS) {
            expect(
                parseRoleResult({
                    role,
                    output: {
                        outcome: 'environment',
                        environment: { evidence: EVIDENCE },
                    },
                })
            ).toMatchObject({
                ok: true,
                value: {
                    role,
                    result: {
                        outcome: 'environment',
                        environment: { evidence: EVIDENCE },
                    },
                },
            })
            for (const output of [
                { outcome: 'environment' },
                { outcome: 'environment', environment: null },
                { outcome: 'environment', environment: { evidence: '' } },
            ]) {
                expect(parseRoleResult({ role, output }).ok).toBe(false)
            }
        }
    })
})

describe("the writers' instructions (#613)", () => {
    test('describe the environment outcome, when to use it, and that the engine checks it by rerunning', () => {
        for (const role of WRITERS) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: PRACTICE_ENGINE_CONFIG,
            })
            expect(text).toContain('"environment"')
            expect(text).toContain('evidence')
            expect(text).toContain('EADDRINUSE')
            expect(text).toContain('baseline')
            expect(text).toMatch(/rerun/i)
        }
    })
})

describe('the journal records of an environment failure (#613)', () => {
    test('keep the evidence of each environment answer and the environment_failed reason of a stuck ticket or final review', () => {
        const answer = (
            role: 'test-writer' | 'implementer',
            ticket: number | null
        ): JournalEntry =>
            role === 'test-writer'
                ? {
                      kind: 'agent_finished',
                      ticket,
                      role,
                      content: {
                          role,
                          session_id: 'tw-1',
                          result: {
                              outcome: 'environment',
                              environment: { evidence: EVIDENCE },
                          },
                      },
                  }
                : {
                      kind: 'agent_finished',
                      ticket,
                      role,
                      content: {
                          role,
                          session_id: 'impl-1',
                          result: {
                              outcome: 'environment',
                              environment: { evidence: EVIDENCE },
                          },
                      },
                  }
        const records = recordsFrom({
            entries: [
                answer('test-writer', 11),
                answer('implementer', 11),
                answer('implementer', null),
                {
                    kind: 'ticket_stuck',
                    ticket: 11,
                    role: null,
                    content: { reason: 'environment_failed', detail: EVIDENCE },
                },
                {
                    kind: 'final_review_stuck',
                    ticket: null,
                    role: null,
                    content: { reason: 'environment_failed', detail: EVIDENCE },
                },
            ],
        })
        expect(records.map(({ content }) => content)).toMatchObject([
            {
                role: 'test-writer',
                result: {
                    outcome: 'environment',
                    environment: { evidence: EVIDENCE },
                },
            },
            {
                role: 'implementer',
                result: {
                    outcome: 'environment',
                    environment: { evidence: EVIDENCE },
                },
            },
            {
                role: 'implementer',
                result: {
                    outcome: 'environment',
                    environment: { evidence: EVIDENCE },
                },
            },
            { reason: 'environment_failed', detail: EVIDENCE },
            { reason: 'environment_failed', detail: EVIDENCE },
        ])
    })
})
