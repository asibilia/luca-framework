import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CRASH_SECTION } from './fix-loop-text'

import type { AgentLauncher } from '../agents/agent-launcher'
import {
    createScriptedLauncher,
    type ScriptedTurn,
} from '../agents/scripted-launcher'
import type { JournalRecord } from '../journal/journal-record'
import {
    createPracticeRepo,
    happyTurns,
    IMPLEMENTER_RESULT,
} from '../testing/practice-repo'

/**
 * Seam 2 for crash recovery (#369): the scheduler journals each step it
 * starts between `step_started` and `step_ended`. An engine started again
 * on a journal with a step left open appends one `run_resumed`, then takes
 * the step again, an agent's turn in a fresh session.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-crash-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** An implementer whose code fails the tests, so the gates fail. */
const WRONG: ScriptedTurn = {
    role: 'implementer',
    ticket: 11,
    files: {
        'src/sum.ts': 'export const sum = (): number => 42\n',
        'src/index.ts': "export { sum } from './sum'\n",
    },
    result: IMPLEMENTER_RESULT,
}

/** A launcher whose calls throw, as if the engine died mid-turn. */
const crashingOn = ({
    launcher,
    kind,
}: {
    launcher: AgentLauncher
    kind: 'launch' | 'follow_up'
}): AgentLauncher => ({
    launch: (args) =>
        kind === 'launch'
            ? Promise.reject(new Error('The engine crashed.'))
            : launcher.launch(args),
    followUp: (args) =>
        kind === 'follow_up'
            ? Promise.reject(new Error('The engine crashed.'))
            : launcher.followUp(args),
})

const ofKind = <Kind extends JournalRecord['kind']>(
    records: JournalRecord[],
    kind: Kind
): Extract<JournalRecord, { kind: Kind }>[] =>
    records.filter(
        (record): record is Extract<JournalRecord, { kind: Kind }> =>
            record.kind === kind
    )

describe('crash recovery, end to end', () => {
    test('a follow-up cut off by a crash is taken again by a fresh agent carrying its message', async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()

        const crashed = practice.run({
            launcher: crashingOn({
                launcher: createScriptedLauncher({
                    turns: [testWriter, WRONG],
                }),
                kind: 'follow_up',
            }),
        })
        await expect(crashed).rejects.toThrow('The engine crashed.')
        const before = practice.journal.read()
        const open = ofKind(before, 'step_started').at(-1)
        expect(open?.content).toEqual({
            key: '11',
            step: 'follow_up_agent:implementer',
            first_seq: null,
        })
        expect(ofKind(before, 'step_ended').at(-1)?.seq ?? 0).toBeLessThan(
            open?.seq ?? 0
        )

        const { action, launches } = await practice.run({
            resume: true,
            turns: [implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const after = practice.journal.read()
        expect(ofKind(after, 'run_resumed')).toEqual([
            expect.objectContaining({
                seq: before.length + 1,
                content: {
                    interrupted: [
                        {
                            key: '11',
                            step: 'follow_up_agent:implementer',
                            ticket: 11,
                            role: 'implementer',
                            started_seq: open?.seq,
                            first_seq: null,
                        },
                    ],
                },
            }),
        ])
        const redo = launches.find(({ role }) => role === 'implementer')
        expect(redo).toMatchObject({ kind: 'launch', role: 'implementer' })
        expect(redo?.prompt).toContain('The gates failed.')
        expect(redo?.prompt).toContain(CRASH_SECTION)
        expect(launches.some(({ kind }) => kind === 'follow_up')).toBe(false)
        // Every step the resumed engine started, it saw end.
        const resumed = after.slice(before.length)
        expect(ofKind(resumed, 'step_started')).toHaveLength(
            ofKind(resumed, 'step_ended').length
        )
    })

    test("a redone step's step_started names its first try", async () => {
        const practice = await createPracticeRepo({ root })
        const { testWriter, implementer, reviewer } = happyTurns()

        await practice
            .run({
                launcher: crashingOn({
                    launcher: createScriptedLauncher({ turns: [] }),
                    kind: 'launch',
                }),
            })
            .catch(() => undefined)
        const first = ofKind(practice.journal.read(), 'step_started').at(-1)
        expect(first?.content.step).toBe('launch_agent:test-writer')

        const { action } = await practice.run({
            resume: true,
            turns: [testWriter, implementer, reviewer],
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const starts = ofKind(practice.journal.read(), 'step_started').filter(
            ({ content }) => content.step === 'launch_agent:test-writer'
        )
        expect(starts.map(({ content }) => content.first_seq)).toEqual([
            null,
            first?.seq ?? -1,
        ])
    })
})
