import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import type { ScriptedCall, ScriptedTurn } from '../agents/scripted-launcher'
import type { Journal } from '../journal/journal'
import type { JournalRecord } from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import type { EngineClock } from '../limits/limit-wait'
import { createFakeMuninn, type FakeMuninn } from '../testing/fake-muninn'
import { SPEC_OWNER } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    happyTurns,
    practiceTracker,
} from '../testing/practice-repo'

/**
 * Seam 2 for memory (#370): whole runs on the practice repo with scripted
 * agents and a fake MuninnDB. Memories reach the agents at each recall
 * point, the learner's memories are saved (updated or added) with feedback,
 * and they are listed in the PR, or on the spec after a `stop`. A MuninnDB
 * that errors or hangs never keeps a run from finishing. No real MuninnDB,
 * no models.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-memory-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

const PROJECT = 'luca-monorepo'

/** Memories that a search finds when its query holds their `match`. */
const seededMuninn = (
    options: Parameters<typeof createFakeMuninn>[0] = {}
): FakeMuninn =>
    createFakeMuninn({
        vaults: {
            [PROJECT]: [
                {
                    id: 'p-spec',
                    concept: 'decision:practice-layout',
                    content: 'Sources live in src/.',
                    score: 0.95,
                    match: 'Practice spec',
                },
                {
                    id: 'p-low',
                    concept: 'pitfall:barely-related',
                    content: 'Barely related.',
                    score: 0.3,
                },
            ],
            default: [
                {
                    id: 'd-sum',
                    concept: 'pattern:object-args',
                    content: 'Functions take one object argument.',
                    score: 0.8,
                    match: 'Add sum',
                },
                {
                    id: 'd-review',
                    concept: 'pitfall:sum-empty-list',
                    content: 'Check the empty list.',
                    score: 0.7,
                    match: 'src/sum.ts',
                },
                {
                    id: 'd-fix',
                    concept: 'pitfall:read-the-expected-value',
                    content:
                        'Read what the test expected before changing code.',
                    score: 0.75,
                    match: 'expected',
                },
                {
                    id: 'd-junit',
                    concept: 'pitfall:bun-junit',
                    content: 'Old text.',
                    score: 0.6,
                    vector_score: 0.92,
                    match: 'bun-junit',
                },
            ],
        },
        ...options,
    })

const LEARNER: ScriptedTurn = {
    role: 'learner',
    ticket: 10,
    result: {
        memories: [
            {
                type: 'pitfall',
                concept: 'bun-junit',
                content: 'Bun needs --reporter=junit and --reporter-outfile.',
                summary: 'JUnit flags',
            },
            {
                type: 'decision',
                concept: 'engine-owns-memory',
                content: 'Only the engine talks to MuninnDB.',
                summary: 'Engine-only memory',
            },
            {
                type: 'session',
                concept: 'today',
                content: 'What happened today.',
                summary: '',
            },
        ],
        helped: ['p-spec', 'never-shown'],
    },
}

const launchOf = (
    launches: ScriptedCall[],
    role: string
): ScriptedCall | undefined =>
    launches.find((call) => call.kind === 'launch' && call.role === role)

const recalled = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'memory_recalled' ? [record.content] : []
    )

const savedOf = (records: JournalRecord[]) =>
    records.flatMap((record) =>
        record.kind === 'memories_saved' ? [record.content] : []
    )

describe('memory, end to end', () => {
    test('memories reach the agents at each recall point, and the learner’s are saved, fed back, and listed in the PR', async () => {
        const practice = await createPracticeRepo({ root })
        const muninn = seededMuninn()
        const { testWriter, implementer, reviewer } = happyTurns()
        const wrong: ScriptedTurn = {
            ...implementer,
            files: {
                'src/sum.ts': 'export const sum = (): number => 42\n',
                'src/index.ts': "export { sum } from './sum'\n",
            },
        }

        const { action, records, launches, tracker } = await practice.run({
            turns: [testWriter, wrong, implementer, reviewer, LEARNER],
            memory: { client: muninn, project_vault: PROJECT },
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // The run's start and the ticket, at the test-writer.
        const writer = launchOf(launches, 'test-writer')?.prompt ?? ''
        expect(writer.startsWith('## Memories from past runs\n')).toBe(true)
        expect(writer).toContain(
            `- [${PROJECT}] decision:practice-layout: Sources live in src/.`
        )
        expect(writer).toContain('## Memories from past runs for this ticket')
        expect(writer).toContain('pattern:object-args')
        expect(writer).not.toContain('pitfall:barely-related')
        expect(launchOf(launches, 'implementer')?.prompt).toContain(
            'pattern:object-args'
        )

        // The fix round after the failed gates, in the follow-up.
        const followUp = launches.find(
            (call) => call.kind === 'follow_up' && call.role === 'implementer'
        )
        expect(followUp?.prompt).toContain(
            '## Memories from past runs for this fix'
        )
        expect(followUp?.prompt).toContain('pitfall:read-the-expected-value')

        // The review, and the final review's lenses.
        expect(launchOf(launches, 'ticket-reviewer')?.prompt).toContain(
            'pitfall:sum-empty-list'
        )
        const lens = launchOf(launches, 'security-lens')?.prompt ?? ''
        expect(lens.startsWith('## Memories from past runs\n')).toBe(true)
        expect(lens).toContain('pitfall:sum-empty-list')

        // Every search is journaled with its vaults and scores.
        const searches = recalled(records)
        expect(searches.map(({ point }) => point)).toEqual([
            'run_start',
            'ticket',
            'fix_round',
            'review',
            'review',
        ])
        expect(searches[0]?.vaults).toEqual([
            { vault: PROJECT, ok: true, error: null, found: 1 },
            { vault: 'default', ok: true, error: null, found: 0 },
        ])
        expect(searches[0]?.memories).toEqual([
            {
                id: 'p-spec',
                vault: PROJECT,
                concept: 'decision:practice-layout',
                content: 'Sources live in src/.',
                score: 0.95,
            },
        ])

        // The learner read a digest of the journal, before the PR.
        const learner = launchOf(launches, 'learner')?.prompt ?? ''
        expect(learner).toContain('# Your role: learner')
        expect(learner).toContain('gates failed')
        expect(learner).toContain(
            `- id p-spec [${PROJECT}] decision:practice-layout`
        )
        const kinds = records.map(({ kind }) => kind)
        expect(kinds.indexOf('memories_saved')).toBeLessThan(
            kinds.indexOf('pull_request_opened')
        )

        // Updated the similar one, added the new one, refused the unknown type.
        const [saved] = savedOf(records)
        expect(saved?.saves).toEqual([
            {
                type: 'session',
                concept: 'today',
                vault: null,
                outcome: 'refused',
                id: null,
                similar: null,
                error: expect.stringContaining('Unknown memory type "session"'),
            },
            {
                type: 'pitfall',
                concept: 'pitfall:bun-junit',
                vault: 'default',
                outcome: 'updated',
                id: 'd-junit',
                similar: { id: 'd-junit', score: 0.6, vector_score: 0.92 },
                error: null,
            },
            {
                type: 'decision',
                concept: 'decision:engine-owns-memory',
                vault: PROJECT,
                outcome: 'added',
                id: 'fake-1',
                similar: { id: 'p-low', score: 0.3, vector_score: null },
                error: null,
            },
        ])
        expect(
            muninn.stored('default').find(({ id }) => id === 'd-junit')?.content
        ).toBe('Bun needs --reporter=junit and --reporter-outfile.')
        expect(
            muninn.stored(PROJECT).find(({ id }) => id === 'fake-1')
        ).toMatchObject({
            concept: 'decision:engine-owns-memory',
            type: 'decision',
            tags: ['luca', 'spec-10'],
        })

        // Feedback on every memory shown: only the one that helped is useful.
        const feedback = muninn
            .calls()
            .filter(({ op }) => op === 'feedback')
            .map(({ args }) => [args.id, args.useful])
        expect(feedback).toEqual([
            ['p-spec', true],
            ['d-sum', false],
            ['d-fix', false],
            ['d-review', false],
        ])
        expect(saved?.feedback.every(({ ok }) => ok)).toBe(true)

        // The PR lists them.
        const [pull] = tracker.pullRequests()
        expect(pull?.body).toContain('## New memories')
        expect(pull?.body).toContain(
            '- pitfall in `default`: pitfall:bun-junit (d-junit), updated'
        )
        expect(pull?.body).toContain(
            `- decision in \`${PROJECT}\`: decision:engine-owns-memory (fake-1), added`
        )
        expect(pull?.body).not.toContain('session')
    }, 60_000)

    test('a stopped run still learns, and its new memories go on the spec issue', async () => {
        const practice = await createPracticeRepo({ root })
        const muninn = seededMuninn()
        const tracker = practiceTracker()
        let replied = false
        const clock: EngineClock = {
            now: () => Date.now(),
            sleep: async () => {
                await Bun.sleep(5)
                const state = replayRun({ records: practice.journal.read() })
                if (
                    replied ||
                    (state.tickets[11]?.stuck_report ?? null) === null
                ) {
                    return
                }
                replied = true
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'stop',
                })
            },
        }

        const { action, records, launches } = await practice.run({
            tracker,
            clock,
            stop_before: [],
            memory: { client: muninn, project_vault: PROJECT },
            turns: [
                {
                    role: 'test-writer',
                    ticket: 11,
                    result: { outcome: 'nothing_new_to_test' },
                },
                {
                    role: 'learner',
                    ticket: 10,
                    result: {
                        memories: [
                            {
                                type: 'pitfall',
                                concept: 'label-refactors',
                                content:
                                    'A ticket that changes no behavior needs the refactor label.',
                                summary: 'Label refactors',
                            },
                        ],
                        helped: [],
                    },
                },
            ],
        })

        expect(action).toEqual({ type: 'done', outcome: 'stopped_by_user' })
        expect(tracker.pullRequests()).toEqual([])
        expect(launchOf(launches, 'learner')?.prompt).toContain(
            'replied `stop`'
        )
        const comments = tracker.commentsOn({ number: 10 })
        const listing = comments.find((body) =>
            body.includes('pitfall:label-refactors')
        )
        expect(listing).toContain('(fake-1), added')
        expect(
            records.find(({ kind }) => kind === 'memories_reported')
        ).toMatchObject({
            content: { count: 1 },
        })
        // The learner ran after the stop reply, before the run ended.
        const kinds = records.map(({ kind }) => kind)
        expect(kinds.lastIndexOf('memories_reported')).toBeGreaterThan(
            kinds.indexOf('reply_received')
        )
    }, 60_000)

    test('a MuninnDB that errors or hangs still lets the run finish, with the errors journaled', async () => {
        const practice = await createPracticeRepo({ root })
        const muninn = seededMuninn({
            fail: [{ vault: PROJECT }],
            hang: [{ op: 'feedback' }],
        })
        const { action, records, launches, tracker } = await practice.run({
            turns: [...Object.values(happyTurns()), LEARNER],
            memory: { client: muninn, project_vault: PROJECT, timeout_ms: 50 },
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const [start] = recalled(records)
        expect(start?.vaults).toEqual([
            {
                vault: PROJECT,
                ok: false,
                error: `MuninnDB's recall failed: The fake MuninnDB fails recall in ${PROJECT}.`,
                found: 0,
            },
            { vault: 'default', ok: true, error: null, found: 0 },
        ])
        // default still answered for the ticket.
        expect(launchOf(launches, 'test-writer')?.prompt).toContain(
            'pattern:object-args'
        )
        const [saved] = savedOf(records)
        expect(
            saved?.saves.find(({ type }) => type === 'decision')
        ).toMatchObject({
            outcome: 'failed',
            id: null,
            error: expect.stringContaining(
                'Could not look for a similar memory'
            ),
        })
        expect(
            saved?.saves.find(({ type }) => type === 'pitfall')
        ).toMatchObject({
            outcome: 'updated',
        })
        expect(saved?.feedback.length).toBeGreaterThan(0)
        expect(saved?.feedback.every(({ ok }) => !ok)).toBe(true)
        expect(saved?.feedback[0]?.error).toBe(
            "MuninnDB's feedback did not answer within 50 ms."
        )
        expect(tracker.pullRequests()[0]?.body).toContain('pitfall:bun-junit')
    }, 60_000)

    test('an un-scripted learner learns nothing, and the run still opens its PR', async () => {
        const practice = await createPracticeRepo({ root })
        const { action, records, tracker } = await practice.run({
            turns: Object.values(happyTurns()),
            memory: {
                client: createFakeMuninn(),
                project_vault: null,
            },
        })
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(savedOf(records)).toEqual([{ saves: [], feedback: [] }])
        expect(recalled(records)[0]?.vaults.map(({ vault }) => vault)).toEqual([
            'default',
        ])
        expect(tracker.pullRequests()[0]?.body).not.toContain('New memories')
        // The learner's turn and each search are steps (#369).
        const steps = practice.journal.read().flatMap((record) =>
            record.kind === 'step_started'
                ? [
                      {
                          step: record.content.step,
                          key: record.content.key,
                          role: record.role,
                      },
                  ]
                : []
        )
        expect(steps).toContainEqual({
            step: 'launch_learner:learner',
            key: 'run',
            role: 'learner',
        })
        expect(steps).toContainEqual({
            step: 'recall_memories',
            key: 'run',
            role: null,
        })
        expect(steps).toContainEqual({
            step: 'recall_memories',
            key: '11',
            role: null,
        })
    }, 60_000)
})

/**
 * The journal, but the `nth` append of `kind` throws instead, as if the
 * engine died just before journaling it.
 */
const crashOnAppend =
    ({ kind, nth }: { kind: JournalRecord['kind']; nth: number }) =>
    (real: Journal): Journal => {
        let seen = 0
        return {
            ...real,
            append: (entry) => {
                if (entry.kind === kind) {
                    seen += 1
                    if (seen === nth) throw new Error('The engine crashed.')
                }
                return real.append(entry)
            },
        }
    }

describe('memory across a crash (#369)', () => {
    const feedbackIds = (muninn: FakeMuninn) =>
        muninn
            .calls()
            .filter(({ op }) => op === 'feedback')
            .map(({ args }) => args.id)

    const expectSavedOnce = ({
        muninn,
        records,
    }: {
        muninn: FakeMuninn
        records: JournalRecord[]
    }) => {
        const saved = savedOf(records)
        expect(saved).toHaveLength(1)
        expect(
            saved[0]?.saves.map(({ concept, outcome, id }) => [
                concept,
                outcome,
                id,
            ])
        ).toEqual([
            ['today', 'refused', null],
            ['pitfall:bun-junit', 'updated', 'd-junit'],
            ['decision:engine-owns-memory', 'added', 'fake-1'],
        ])
        expect(
            muninn
                .stored(PROJECT)
                .filter(
                    ({ concept }) => concept === 'decision:engine-owns-memory'
                )
        ).toHaveLength(1)
        // Each shown memory's feedback went at most once.
        const sent = feedbackIds(muninn)
        expect(new Set(sent).size).toBe(sent.length)
        expect(saved[0]?.feedback.map(({ id }) => id)).toEqual([
            'p-spec',
            'd-sum',
            'd-review',
        ])
    }

    const turns = (): ScriptedTurn[] => {
        const { testWriter, implementer, reviewer } = happyTurns()
        return [testWriter, implementer, reviewer, LEARNER]
    }

    test('a crash in the middle of saving: the redo saves each memory once and sends each feedback at most once', async () => {
        const practice = await createPracticeRepo({ root })
        const muninn = seededMuninn()
        const memory = { client: muninn, project_vault: PROJECT }

        // Cut off after the add, the 2nd write, before it was journaled.
        await expect(
            practice.run({
                turns: turns(),
                memory,
                journal: crashOnAppend({ kind: 'memory_write_done', nth: 2 }),
            })
        ).rejects.toThrow('The engine crashed.')
        expect(muninn.stored(PROJECT)).toHaveLength(3)

        const { action, records, tracker } = await practice.run({
            resume: true,
            turns: [],
            memory,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expectSavedOnce({ muninn, records })
        // The add in doubt was repeated with its op id; MuninnDB kept one.
        const adds = muninn.calls().filter(({ op }) => op === 'remember')
        expect(adds).toHaveLength(2)
        expect(new Set(adds.map(({ args }) => args.op_id)).size).toBe(1)
        expect(feedbackIds(muninn)).toEqual(['p-spec', 'd-sum', 'd-review'])
        expect(savedOf(records)[0]?.feedback.every(({ ok }) => ok)).toBe(true)
        expect(tracker.pullRequests()).toHaveLength(1)
        expect(tracker.pullRequests()[0]?.body).toContain(
            'decision:engine-owns-memory (fake-1), added'
        )
    }, 60_000)

    test('a crash after every write but before memories_saved: the redo writes nothing again', async () => {
        const practice = await createPracticeRepo({ root })
        const muninn = seededMuninn()
        const memory = { client: muninn, project_vault: PROJECT }

        await expect(
            practice.run({
                turns: turns(),
                memory,
                journal: crashOnAppend({ kind: 'memories_saved', nth: 1 }),
            })
        ).rejects.toThrow('The engine crashed.')
        const writes = muninn.calls().filter(({ op }) => op !== 'recall').length

        const { action, records } = await practice.run({
            resume: true,
            turns: [],
            memory,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        expect(muninn.calls().filter(({ op }) => op !== 'recall').length).toBe(
            writes
        )
        expectSavedOnce({ muninn, records })
    }, 60_000)

    test("the memories' comment on the spec is posted once when a crash came between posting and journaling it", async () => {
        const practice = await createPracticeRepo({ root })
        const muninn = seededMuninn()
        const memory = { client: muninn, project_vault: PROJECT }
        const tracker = practiceTracker()
        let replied = false
        const clock: EngineClock = {
            now: () => Date.now(),
            sleep: async () => {
                await Bun.sleep(5)
                const state = replayRun({ records: practice.journal.read() })
                if (
                    replied ||
                    (state.tickets[11]?.stuck_report ?? null) === null
                ) {
                    return
                }
                replied = true
                tracker.addComment({
                    number: 10,
                    author: SPEC_OWNER,
                    body: 'stop',
                })
            },
        }
        const learner: ScriptedTurn = {
            role: 'learner',
            ticket: 10,
            result: {
                memories: [
                    {
                        type: 'pitfall',
                        concept: 'label-refactors',
                        content: 'A refactor needs the refactor label.',
                        summary: 'Label refactors',
                    },
                ],
                helped: [],
            },
        }

        await expect(
            practice.run({
                tracker,
                clock,
                stop_before: [],
                memory,
                turns: [
                    {
                        role: 'test-writer',
                        ticket: 11,
                        result: { outcome: 'nothing_new_to_test' },
                    },
                    learner,
                ],
                journal: crashOnAppend({ kind: 'memories_reported', nth: 1 }),
            })
        ).rejects.toThrow('The engine crashed.')
        const listings = () =>
            tracker
                .commentsOn({ number: 10 })
                .filter((body) => body.includes('pitfall:label-refactors'))
        expect(listings()).toHaveLength(1)

        const { action, records } = await practice.run({
            resume: true,
            tracker,
            clock,
            stop_before: [],
            memory,
            turns: [],
        })

        expect(action).toEqual({ type: 'done', outcome: 'stopped_by_user' })
        expect(listings()).toHaveLength(1)
        expect(
            records.filter(({ kind }) => kind === 'memories_reported')
        ).toHaveLength(1)
    }, 60_000)
})
