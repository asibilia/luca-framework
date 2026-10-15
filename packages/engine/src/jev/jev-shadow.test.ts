import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import type { DecisionModelClient } from './clef-client'
import type { JevAsk } from './jev-jobs'
import type { JevAnswer, JevQuestion, JevRequest } from './jev-schemas'
import { shadowAsker } from './jev-shadow'

import { createJournal } from '../journal/journal'

/**
 * `shadowAsker` on its own, with a fake Jev and no practice repo, so it runs
 * with the fast tests (#568). Jev in shadow mode on a whole run is in
 * `jev-shadow.e2e.test.ts`.
 */

const roots: string[] = []

const newRoot = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'luca-engine-jev-'))
    roots.push(root)
    return root
}

afterAll(async () => {
    await Promise.all(
        roots.map((root) => rm(root, { recursive: true, force: true }))
    )
})

/** The model id the fake decision models say they are. */
const FAKE_MODEL = '@cf/cloudflare/clef'

/**
 * A Jev that answers every question, and never as the engine would: the
 * last option of each choice, the top of each score, yes to every skill.
 */
const disagreeingAnswer = (question: JevQuestion): JevAnswer => {
    switch (question.type) {
        case 'choice': {
            const choice = Object.keys(question.criteria).at(-1) ?? null
            return {
                value: choice,
                confidence: 0.7,
                raw: { choice, confidence: 0.7 },
            }
        }
        case 'score': {
            const score = question.criteria.at(-1) ?? null
            return {
                value: score,
                confidence: 0.6,
                raw: { score, confidence: 0.6 },
            }
        }
        case 'noul':
            return { value: 0.95, confidence: null, raw: { probability: 0.95 } }
    }
}

const disagreeingJev = (): DecisionModelClient & {
    signals: AbortSignal[]
    requests: JevRequest[]
} => {
    const signals: AbortSignal[] = []
    const requests: JevRequest[] = []
    return {
        signals,
        requests,
        model: FAKE_MODEL,
        ask: async ({ request, signal }) => {
            signals.push(signal)
            requests.push(request)
            return {
                ok: true,
                answers: Object.fromEntries(
                    Object.entries(request.questions).map(([id, question]) => [
                        id,
                        disagreeingAnswer(question),
                    ])
                ),
            }
        },
    }
}

describe('shadowAsker', () => {
    const choiceAsk = ({
        job,
        options,
    }: {
        job: JevAsk['job']
        options: string[]
    }): JevAsk => ({
        job,
        ticket: 11,
        role: null,
        request: {
            state: { spec: 'Practice spec' },
            questions: {
                pick: {
                    type: 'choice',
                    instructions: 'Which one?',
                    criteria: Object.fromEntries(
                        options.map((option) => [option, null])
                    ),
                },
            },
        },
        fixed: { pick: options[0] ?? 'none' },
    })

    test('skips any ask whose choice has fewer than two options: no call and no record', async () => {
        const root = await newRoot()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const jev = disagreeingJev()
        const ask = shadowAsker({ jev: { client: jev }, journal })

        await ask([
            choiceAsk({ job: 'ticket_order', options: ['ticket_11'] }),
            choiceAsk({ job: 'failure_kind', options: ['code'] }),
            choiceAsk({ job: 'ticket_model', options: [] }),
        ])

        expect(jev.signals).toHaveLength(0)
        expect(journal.read()).toEqual([])
    })

    test('still asks the valid asks beside a skipped one, exactly as before', async () => {
        const root = await newRoot()
        const journal = createJournal({ file: join(root, 'journal.jsonl') })
        const jev = disagreeingJev()
        const ask = shadowAsker({ jev: { client: jev }, journal })
        const valid = choiceAsk({
            job: 'ticket_model',
            options: ['claude-opus-5-5', 'claude-haiku-4-5'],
        })

        await ask([
            choiceAsk({ job: 'ticket_order', options: ['ticket_11'] }),
            valid,
        ])

        expect(jev.signals).toHaveLength(1)
        const records = journal.read()
        expect(records.map(({ kind }) => kind)).toEqual([
            'jev_asked',
            'jev_answered',
        ])
        expect(records[0]?.content).toEqual({
            job: 'ticket_model',
            request: valid.request,
            fixed: valid.fixed,
            model: FAKE_MODEL,
        })
        expect(records[1]?.content).toMatchObject({
            job: 'ticket_model',
            asked_seq: records[0]?.seq,
            answers: {
                pick: { value: 'claude-haiku-4-5', confidence: 0.7 },
            },
        })
    })
})
