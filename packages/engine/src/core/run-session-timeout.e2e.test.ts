import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { failedTryMessage } from './fix-loop-text'
import { callsOf, scriptedWith } from './run-session-close-helpers'

import type { AgentLauncher } from '../agents/agent-launcher'
import type { AgentRole } from '../agents/role-results'
import type {
    ScriptedLauncher,
    ScriptedTurn,
} from '../agents/scripted-launcher'
import {
    CLEAN_LENS_TURNS,
    createPracticeRepo,
    happyTurns,
    IMPLEMENTER_RESULT,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * A turn that timed out (#685), end to end: the launcher interrupts the
 * test-writer's first turn for running past its time limit and closes its
 * session, and says so with `session_closed`. The engine journals the close,
 * so the next try is a fresh test-writer with the failed-try message, never
 * a follow-up to the closed session.
 */

const TIMEOUT_ERROR = 'No result within 2400000 ms; the agent was interrupted.'

/** The scripted turn that times out: the wrapper below closes its session. */
const timeoutTurn = ({
    role,
    ticket,
}: {
    role: AgentRole
    ticket: number
}): ScriptedTurn => ({ role, ticket, failure: 'agent', error: TIMEOUT_ERROR })

/**
 * The scripted launcher, wrapped so the first failed launch of `role` on
 * `ticket` is a timed-out turn: its session is closed, as the launcher's
 * interrupt does, and its result says so with `session_closed`.
 */
const timingOut = ({
    scripted,
    role,
    ticket,
}: {
    scripted: ScriptedLauncher
    role: AgentRole
    ticket: number | null
}): AgentLauncher => {
    let timedOut = false
    return {
        launch: async (args) => {
            const turn = await scripted.launch(args)
            if (
                timedOut ||
                args.role !== role ||
                args.ticket !== ticket ||
                turn.ok ||
                turn.session_id === undefined
            ) {
                return turn
            }
            timedOut = true
            await scripted.closeSession({ session_id: turn.session_id })
            return { ...turn, session_closed: true }
        },
        followUp: (args) => scripted.followUp(args),
        closeSession: (args) => scripted.closeSession(args),
    }
}

describe('a test-writer turn that timed out, end to end', () => {
    /** One run, built once: every test reads it, and none changes it. */
    let root = ''
    let scripted: ScriptedLauncher
    let run: Omit<PracticeRun, 'origin'>

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-session-timeout-'))
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        scripted = scriptedWith([
            timeoutTurn({ role: 'test-writer', ticket: 11 }),
            testWriter,
            implementer,
            reviewer,
        ])
        run = await practice.run({
            launcher: timingOut({ scripted, role: 'test-writer', ticket: 11 }),
        })
    }, 90_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('the next try is a fresh test-writer, then the implementer, with no follow-up in between', () => {
        expect(run.action).toMatchObject({
            type: 'done',
            outcome: 'pr_opened',
        })
        expect(
            callsOf(scripted, 11).map(({ kind, role }) => `${kind} ${role}`)
        ).toEqual([
            'launch test-writer',
            'launch test-writer',
            'launch implementer',
            'launch ticket-reviewer',
        ])
    })

    test('the journal has no agent_failed with session_gone', () => {
        expect(
            run.records.some(
                (record) =>
                    record.kind === 'agent_failed' &&
                    record.content.session_gone === true
            )
        ).toBe(false)
    })

    test('the journal closes the timed-out session right after its agent_failed', () => {
        const [first] = callsOf(scripted, 11)
        const index = run.records.findIndex(
            (record) =>
                record.kind === 'agent_failed' && record.role === 'test-writer'
        )

        expect(run.records[index]).toMatchObject({
            ticket: 11,
            content: {
                failure: 'agent',
                session_id: first?.session_id,
            },
        })
        expect(run.records[index + 1]).toMatchObject({
            kind: 'agent_session_closed',
            content: { session_id: first?.session_id },
        })
    })

    test("the second test-writer's prompt has the failed-try message with the timeout error", () => {
        const [, second] = callsOf(scripted, 11)

        expect(second).toMatchObject({ kind: 'launch', role: 'test-writer' })
        expect(second?.prompt).toContain(
            failedTryMessage({ failure: 'agent', error: TIMEOUT_ERROR })
        )
    })
})

describe('a final fixer turn that timed out, end to end', () => {
    let root = ''
    let scripted: ScriptedLauncher

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-fixer-timeout-'))
        const practice = await createPracticeRepo({ root })
        scripted = scriptedWith([
            ...Object.values(happyTurns()),
            {
                role: 'security-lens',
                ticket: 10,
                result: {
                    verdict: 'changes_requested',
                    findings: [
                        {
                            id: 'security-S1',
                            severity: 'should_fix',
                            kind: 'code',
                            file: 'src/sum.ts',
                            title: 'Name the accumulator for what it holds',
                            detail: 'total reads like the result.',
                        },
                    ],
                    rulings: [],
                    summary: 'The security lens looked.',
                    assumptions: [],
                },
            },
            timeoutTurn({ role: 'implementer', ticket: 10 }),
            {
                role: 'implementer',
                ticket: 10,
                result: {
                    ...IMPLEMENTER_RESULT,
                    finding_responses: [
                        {
                            finding_id: 'security-S1',
                            response: 'wont_fix',
                            reason: 'The name is fine.',
                        },
                    ],
                },
            },
            ...CLEAN_LENS_TURNS(10),
        ])
        await practice.run({
            launcher: timingOut({ scripted, role: 'implementer', ticket: 10 }),
        })
    }, 120_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test('the next try is a fresh final fixer with the failed-try message, not a follow-up', () => {
        const fixers = callsOf(scripted, 10).filter(
            ({ role }) => role === 'implementer'
        )

        expect(fixers.slice(0, 2).map(({ kind }) => kind)).toEqual([
            'launch',
            'launch',
        ])
        expect(fixers[1]?.prompt).toContain(
            failedTryMessage({ failure: 'agent', error: TIMEOUT_ERROR })
        )
    })
})
