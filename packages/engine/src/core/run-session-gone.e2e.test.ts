import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { followUpSection } from './fix-loop-text'
import {
    callsOf,
    PASSING_SUM_TEST,
    scriptedWith,
} from './run-session-close-helpers'

import type { AgentLauncher } from '../agents/agent-launcher'
import type { ScriptedLauncher } from '../agents/scripted-launcher'
import {
    createPracticeRepo,
    happyTurns,
    type PracticeRun,
} from '../testing/practice-repo'

/**
 * A fix round whose session is gone (#521), end to end: the launcher closes
 * the test-writer's session after its first turn, as an idle timeout does,
 * and the journal never hears of it. The red check's fix round then finds
 * the session gone, and a fresh test-writer takes it, with the fix message.
 */

describe('a red check fix round whose test-writer session is gone, end to end', () => {
    /** One run, built once: every test reads it, and none changes it. */
    let root = ''
    let scripted: ScriptedLauncher
    let run: Omit<PracticeRun, 'origin'>

    beforeAll(async () => {
        root = await mkdtemp(join(tmpdir(), 'luca-session-gone-'))
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()
        scripted = scriptedWith([
            // The first test already passes: the red check fails.
            { ...testWriter, files: { 'src/sum.test.ts': PASSING_SUM_TEST } },
            testWriter,
            implementer,
            reviewer,
        ])
        let closed = false
        const launcher: AgentLauncher = {
            launch: async (args) => {
                const turn = await scripted.launch(args)
                if (
                    !closed &&
                    args.role === 'test-writer' &&
                    turn.session_id !== undefined
                ) {
                    closed = true
                    await scripted.closeSession({ session_id: turn.session_id })
                }
                return turn
            },
            followUp: (args) => scripted.followUp(args),
            closeSession: (args) => scripted.closeSession(args),
        }
        run = await practice.run({ launcher })
    }, 90_000)

    afterAll(async () => {
        await rm(root, { recursive: true, force: true })
    })

    test("the fix round goes to a fresh test-writer with the red check's message, and the run opens its PR", () => {
        const { action, records } = run

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const calls = callsOf(scripted, 11)
        expect(calls.map(({ kind, role }) => `${kind} ${role}`)).toEqual([
            'launch test-writer',
            'follow_up test-writer',
            'launch test-writer',
            'launch implementer',
            'launch ticket-reviewer',
        ])
        const [, lost, fresh] = calls
        expect(fresh?.prompt).toContain(
            followUpSection({ message: lost?.prompt ?? 'no follow-up' })
        )
        expect(records.some(({ kind }) => kind === 'ticket_stuck')).toBe(false)
    })

    test('the journal records the gone session as session_gone on its agent_failed', () => {
        const [first] = callsOf(scripted, 11)
        const failed = run.records.filter(
            (record) =>
                record.kind === 'agent_failed' && record.role === 'test-writer'
        )

        expect(failed).toHaveLength(1)
        expect(failed[0]).toMatchObject({
            ticket: 11,
            content: {
                session_gone: true,
                session_id: first?.session_id,
            },
        })
    })
})
