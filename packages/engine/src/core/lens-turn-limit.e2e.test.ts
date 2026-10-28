import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import type { AgentRole } from '../agents/role-results'
import type { ScriptedCall, ScriptedTurn } from '../agents/scripted-launcher'
import { SPEC_OWNER } from '../testing/intake-fixtures'
import {
    createPracticeRepo,
    happyTurns,
    PRACTICE_SPEC_NUMBER,
} from '../testing/practice-repo'

/**
 * Seam 2 for a lens's turn limit (#684): the practice run end to end. A lens
 * whose last failed try ran out of turns gets twice its role's limit on its
 * next launch, and a line saying so; any other failure in between cancels
 * it, and an owner's `retry` after the three-tries cap keeps it. The limit is
 * read from the scripted launcher's calls.
 */

/** A clock that doesn't wait, for a run that answers its own replies. */
const NO_WAIT = { now: () => Date.now(), sleep: async () => undefined }

const outOfTurnsLine = (turns: number) =>
    `The last try at this review ran out of turns before it finished. This time you have ${turns} turns. Read only what you need, and don't read a file twice.`

/** One failed lens try: out of turns, an agent error, or an engine failure. */
const lensFailed = ({
    role,
    kind,
}: {
    role: AgentRole
    kind: 'out_of_turns' | 'agent' | 'engine'
}): ScriptedTurn => ({
    role,
    ticket: PRACTICE_SPEC_NUMBER,
    failure: kind === 'engine' ? 'engine' : 'agent',
    error: `The ${role} stopped.`,
    ...(kind === 'out_of_turns' ? { out_of_turns: true } : {}),
})

const launchesOf = (calls: ScriptedCall[], role: AgentRole) =>
    calls.filter((call) => call.kind === 'launch' && call.role === role)

type Run = Awaited<
    ReturnType<Awaited<ReturnType<typeof createPracticeRepo>>['run']>
>

/** Builds one practice run once for its describe block, in a fresh folder. */
const oneRun = (build: (root: string) => Promise<Run[]>) => {
    const state: { root: string; runs: Run[] } = { root: '', runs: [] }
    beforeAll(async () => {
        state.root = await mkdtemp(join(tmpdir(), 'luca-lens-turns-'))
        state.runs = await build(state.root)
    }, 120_000)
    afterAll(async () => {
        await rm(state.root, { recursive: true, force: true })
    })
    return state
}

describe('lenses that ran out of turns once, then finished', () => {
    const state = oneRun(async (root) => {
        const practice = await createPracticeRepo({ root })
        return [
            await practice.run({
                turns: [
                    ...Object.values(happyTurns()),
                    lensFailed({ role: 'rules-lens', kind: 'out_of_turns' }),
                    lensFailed({ role: 'security-lens', kind: 'out_of_turns' }),
                ],
            }),
        ]
    })

    test("the rules lens's second launch gets 200 turns, and its prompt starts with the out-of-turns line and a blank line", () => {
        const [run] = state.runs
        expect(run?.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        const [first, second, ...others] = launchesOf(
            run?.launches ?? [],
            'rules-lens'
        )

        expect(others).toEqual([])
        expect(first?.max_turns).toBeUndefined()
        expect(first?.prompt).not.toContain('ran out of turns')
        expect(second?.max_turns).toBe(200)
        expect(second?.prompt.startsWith(`${outOfTurnsLine(200)}\n\n`)).toBe(
            true
        )
        expect(second?.prompt).toContain('# Your role: rules-lens')
    })

    test("the security lens's second launch gets 120 turns, and its line says so", () => {
        const [run] = state.runs
        const [, second] = launchesOf(run?.launches ?? [], 'security-lens')

        expect(second?.max_turns).toBe(120)
        expect(second?.prompt).toContain('This time you have 120 turns.')
        expect(second?.prompt.startsWith(`${outOfTurnsLine(120)}\n\n`)).toBe(
            true
        )
    })
})

describe('a rules lens whose failures were not all out of turns', () => {
    // Its tries: an agent error, then out of turns, then an engine failure,
    // then a finished review.
    const state = oneRun(async (root) => {
        const practice = await createPracticeRepo({ root })
        return [
            await practice.run({
                turns: [
                    ...Object.values(happyTurns()),
                    lensFailed({ role: 'rules-lens', kind: 'agent' }),
                    lensFailed({ role: 'rules-lens', kind: 'out_of_turns' }),
                    lensFailed({ role: 'rules-lens', kind: 'engine' }),
                ],
            }),
        ]
    })

    test("after an agent error that isn't out of turns, the next launch has no max_turns and no out-of-turns line", () => {
        const [run] = state.runs
        expect(run?.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        const [, second, third] = launchesOf(run?.launches ?? [], 'rules-lens')

        expect(second).toBeDefined()
        expect(second?.max_turns).toBeUndefined()
        expect(second?.prompt).not.toContain('ran out of turns')
        // Only the out-of-turns try after it doubles the next launch's limit.
        expect(third?.max_turns).toBe(200)
    })

    test('an engine failure after an out-of-turns try cancels the doubled limit for the next launch', () => {
        const [run] = state.runs
        const launches = launchesOf(run?.launches ?? [], 'rules-lens')

        expect(launches).toHaveLength(4)
        expect(launches[2]?.max_turns).toBe(200)
        expect(launches[3]?.max_turns).toBeUndefined()
        expect(launches[3]?.prompt).not.toContain('ran out of turns')
    })
})

describe('a rules lens out of turns three times, then a retry', () => {
    const state = oneRun(async (root) => {
        const practice = await createPracticeRepo({ root })
        const stuck = await practice.run({
            turns: [
                ...Object.values(happyTurns()),
                lensFailed({ role: 'rules-lens', kind: 'out_of_turns' }),
                lensFailed({ role: 'rules-lens', kind: 'out_of_turns' }),
                lensFailed({ role: 'rules-lens', kind: 'out_of_turns' }),
            ],
        })
        stuck.tracker.addComment({
            number: PRACTICE_SPEC_NUMBER,
            author: SPEC_OWNER,
            body: 'retry',
        })
        const retried = await practice.run({
            tracker: stuck.tracker,
            resume: true,
            stop_before: [],
            clock: NO_WAIT,
        })
        return [stuck, retried]
    })

    test('the review is stuck, and after a retry the next rules lens launch has max_turns 200', () => {
        const [stuck, retried] = state.runs
        expect(stuck?.action).toMatchObject({ type: 'wait_for_reply' })
        expect(
            stuck?.records.some(({ kind }) => kind === 'final_review_stuck')
        ).toBe(true)
        expect(launchesOf(stuck?.launches ?? [], 'rules-lens')).toHaveLength(3)

        const [next] = launchesOf(retried?.launches ?? [], 'rules-lens')
        expect(next?.max_turns).toBe(200)
        expect(next?.prompt.startsWith(`${outOfTurnsLine(200)}\n\n`)).toBe(true)
        expect(retried?.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
    })
})
