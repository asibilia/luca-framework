import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, expect } from 'bun:test'

import type { DecisionModelClient } from './clef-client'
import type { JevAnswer, JevQuestion, JevRequest } from './jev-schemas'

import type { ScriptedTurn } from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import { runPractice, type PracticeRun } from '../testing/practice-repo'

/**
 * Helpers shared by the end-to-end shadow-mode tests
 * (`jev-shadow.e2e.test.ts` and `jev-shadow-findings.e2e.test.ts`): the fake
 * decision model that disagrees with everything, and the run it is compared
 * against.
 */

/** A shadow-mode record: an ask, its reply, or the decision model turning off. */
export const isJev = (record: JournalRecord): boolean =>
    record.kind.startsWith('jev_') || record.kind === 'decision_model_off'

/**
 * Launches with test-run timings (" [7.00ms]") removed and commit shas
 * (which carry the time) masked: a fix-loop follow-up quotes test output,
 * whose timings differ between two runs, and bun leaves the timing off a
 * test that runs very fast, so a timing is dropped whether or not it's there.
 */
const withoutTimings = (launches: PracticeRun['launches']) =>
    launches.map((launch) => ({
        ...launch,
        prompt: launch.prompt
            .replace(/ ?\[\d+(\.\d+)?m?s\]/g, '')
            .replace(/\b[0-9a-f]{40}\b/g, '[sha]'),
    }))

/**
 * Record kinds in order, but the final review's lenses run at once, so
 * the kinds between its start and its pass are sorted.
 */
const kindsInOrder = (records: JournalRecord[]): string[] => {
    const kinds = records
        .filter((record) => !isJev(record))
        .map(({ kind }) => kind)
    const from = kinds.indexOf('final_review_started')
    const to = kinds.indexOf('final_review_passed')
    if (from === -1 || to === -1) return kinds
    return [
        ...kinds.slice(0, from + 1),
        ...kinds.slice(from + 1, to).toSorted(),
        ...kinds.slice(to),
    ]
}

/**
 * Launches in order, but the final review's lenses (which start at once, in
 * any order) sorted by role, with their session numbers masked.
 */
const launchesInOrder = (launches: PracticeRun['launches']) => {
    const lens = (launch: PracticeRun['launches'][number]) =>
        launch.role.endsWith('-lens')
    return [
        ...launches.filter((launch) => !lens(launch)),
        ...launches
            .filter(lens)
            .map((launch) => ({
                ...launch,
                session_id: launch.session_id.replace(/-\d+$/, '-[n]'),
            }))
            .toSorted((left, right) => left.role.localeCompare(right.role)),
    ]
}

/** The run as it would look without Jev: the same steps, prompts, and PR. */
export const expectSameRun = ({
    run,
    without,
}: {
    run: PracticeRun
    without: PracticeRun
}) => {
    expect(run.action).toEqual(without.action)
    expect(kindsInOrder(run.records)).toEqual(kindsInOrder(without.records))
    expect(withoutTimings(launchesInOrder(run.launches))).toEqual(
        withoutTimings(launchesInOrder(without.launches))
    )
    expect(run.tracker.pullRequests()).toEqual(without.tracker.pullRequests())
}

/** The model id the fake decision models say they are. */
export const FAKE_MODEL = '@cf/cloudflare/clef'

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

/** Whether a request has a choice Clef refuses: fewer than two options (#546). */
export const hasOneOptionChoice = (request: JevRequest): boolean =>
    Object.values(request.questions).some(
        (question) =>
            question.type === 'choice' &&
            Object.keys(question.criteria).length < 2
    )

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

type Asked = Extract<JournalRecord, { kind: 'jev_asked' }>
type Answered = Extract<JournalRecord, { kind: 'jev_answered' }>
type Failed = Extract<JournalRecord, { kind: 'jev_failed' }>

export const asked = (records: JournalRecord[]): Asked[] =>
    records.filter((record): record is Asked => record.kind === 'jev_asked')

/** The record right after each ask: its answer or its failure. */
export const replyTo = (
    records: JournalRecord[],
    ask: Asked
): Answered | Failed | undefined => {
    const next = records[records.indexOf(ask) + 1]
    return next?.kind === 'jev_answered' || next?.kind === 'jev_failed'
        ? next
        : undefined
}

export const SKILL_IDS = [
    'tdd',
    'systematic_debugging',
    'codebase_design',
    'domain_modeling',
]

/** A practice run with Jev, and the same run without it, built once. */
export const shareRuns = ({ turns }: { turns: () => ScriptedTurn[] }) => {
    const shared: {
        roots: string[]
        jev?: ReturnType<typeof disagreeingJev>
        run?: PracticeRun
        without?: PracticeRun
    } = { roots: [] }
    beforeAll(async () => {
        const root = await mkdtemp(join(tmpdir(), 'luca-engine-jev-'))
        shared.roots.push(root)
        const jev = disagreeingJev()
        shared.jev = jev
        shared.run = await runPractice({
            root: join(root, 'with-jev'),
            turns: turns(),
            jev: { client: jev },
        })
        shared.without = await runPractice({
            root: join(root, 'without-jev'),
            turns: turns(),
        })
    }, 120_000)
    afterAll(async () => {
        await Promise.all(
            shared.roots.map((root) =>
                rm(root, { recursive: true, force: true })
            )
        )
    })
    return () => {
        const { jev, run, without } = shared
        if (jev === undefined || run === undefined || without === undefined) {
            throw new Error('The shared runs were not built.')
        }
        return { jev, run, without }
    }
}
