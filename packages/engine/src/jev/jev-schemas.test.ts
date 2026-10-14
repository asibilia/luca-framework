import { describe, expect, test } from 'bun:test'

import { ClefRequestSchema, type JevQuestion } from './jev-schemas'

const choiceOf = (count: number): JevQuestion => ({
    type: 'choice',
    instructions: 'Pick one.',
    criteria: Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`option_${index}`, null])
    ),
})

const scoreOf = (count: number) => ({
    type: 'score' as const,
    instructions: 'How much?',
    criteria: Array.from({ length: count }, (_, index) => `level_${index}`),
})

const noul: JevQuestion = { type: 'noul', instructions: 'Yes or no?' }

const questionsOf = (count: number): Record<string, JevQuestion> =>
    Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`q_${index}`, noul])
    )

const fits = (questions: Record<string, unknown>): boolean =>
    ClefRequestSchema.safeParse({ state: { spec: 'Practice spec' }, questions })
        .success

describe("Clef's request limits", () => {
    test('takes from one to 64 questions', () => {
        expect(fits(questionsOf(0))).toBe(false)
        expect(fits(questionsOf(1))).toBe(true)
        expect(fits(questionsOf(64))).toBe(true)
        expect(fits(questionsOf(65))).toBe(false)
    })

    test('takes a choice of 2 to 255 options', () => {
        expect(fits({ next: choiceOf(0) })).toBe(false)
        expect(fits({ next: choiceOf(1) })).toBe(false)
        expect(fits({ next: choiceOf(2) })).toBe(true)
        expect(fits({ next: choiceOf(255) })).toBe(true)
        expect(fits({ next: choiceOf(256) })).toBe(false)
    })

    test('takes a score of 2 to 10 levels', () => {
        expect(fits({ severity: scoreOf(1) })).toBe(false)
        expect(fits({ severity: scoreOf(2) })).toBe(true)
        expect(fits({ severity: scoreOf(10) })).toBe(true)
        expect(fits({ severity: scoreOf(11) })).toBe(false)
    })

    test('turns down a request when any one of its questions is out of bounds', () => {
        expect(fits({ model: choiceOf(3), next: choiceOf(1) })).toBe(false)
        expect(fits({ model: choiceOf(3), tdd: noul })).toBe(true)
    })
})
