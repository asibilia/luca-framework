import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createScriptedLauncher } from '../agents/scripted-launcher'
import {
    CLEAN_LENS_TURNS,
    HAPPY_TURNS,
    runPractice,
} from '../testing/practice-repo'

/**
 * Seam 2: one ticket, end to end, on the practice repo
 * (`testing/practice-repo.ts`), the messages agents send each other. The
 * happy run is in `run-one-ticket.e2e.test.ts`.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-e2e-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('agent messages, end to end', () => {
    test('a test-writer messages the implementer, who gets it at its first tool call; the cap and reviewers are refused', async () => {
        const [testWriter, implementer, reviewer] = HAPPY_TURNS
        if (!testWriter || !implementer || !reviewer) throw new Error('turns')
        const first = 'sum takes { numbers }, not two arguments.'
        const answers: { ok: boolean; detail: string }[] = []
        const implementerGot: (string | null)[] = []
        const reviewerGot: (string | null)[] = []
        const lensAnswers: { ok: boolean; detail: string }[] = []
        const launcher = createScriptedLauncher({
            turns: [
                {
                    ...testWriter,
                    act: async (_cwd, tools) => {
                        answers.push(
                            tools.send_message({
                                to: 'ticket-reviewer#11',
                                text: 'Please approve.',
                            })
                        )
                        answers.push(
                            tools.send_message({
                                to: 'implementer#11',
                                text: first,
                            })
                        )
                        for (let count = 2; count <= 6; count += 1) {
                            answers.push(
                                tools.send_message({
                                    to: 'implementer#11',
                                    text: `Heads-up ${count}.`,
                                })
                            )
                        }
                    },
                },
                {
                    ...implementer,
                    act: async (_cwd, tools) => {
                        implementerGot.push(tools.tool_call('Read'))
                        implementerGot.push(tools.tool_call('Bash'))
                    },
                },
                {
                    ...reviewer,
                    act: async (_cwd, tools) => {
                        answers.push(
                            tools.send_message({
                                to: 'implementer#11',
                                text: 'From the reviewer.',
                            })
                        )
                        reviewerGot.push(tools.tool_call('Read'))
                    },
                },
                // A lens is a reviewer: it has no send_message tool.
                {
                    role: 'security-lens',
                    ticket: 10,
                    act: async (_cwd, tools) => {
                        lensAnswers.push(
                            tools.send_message({
                                to: 'implementer#11',
                                text: 'From the security lens.',
                            })
                        )
                    },
                    result: {
                        verdict: 'approve',
                        findings: [],
                        summary: '',
                        assumptions: [],
                    },
                },
                ...CLEAN_LENS_TURNS(10),
            ],
        })
        const { action, records } = await runPractice({
            root,
            turns: [],
            launcher,
        })

        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })

        // What each send answered the agent.
        expect(answers.map(({ ok }) => ok)).toEqual([
            false,
            true,
            true,
            true,
            true,
            true,
            false,
            false,
        ])
        expect(answers[6]?.detail).toContain('5 messages')
        expect(lensAnswers).toEqual([
            { ok: false, detail: 'This agent has no send_message tool.' },
        ])

        // Every message is journaled word for word, refused ones too.
        const messages = records.flatMap((record) =>
            record.kind === 'agent_message'
                ? [
                      {
                          ticket: record.ticket,
                          role: record.role,
                          ...record.content,
                      },
                  ]
                : []
        )
        expect(
            messages.map(({ id, status, to }) => ({ id, status, to }))
        ).toEqual([
            { id: 'msg-1', status: 'refused', to: 'ticket-reviewer#11' },
            { id: 'msg-2', status: 'queued', to: 'implementer#11' },
            { id: 'msg-3', status: 'queued', to: 'implementer#11' },
            { id: 'msg-4', status: 'queued', to: 'implementer#11' },
            { id: 'msg-5', status: 'queued', to: 'implementer#11' },
            { id: 'msg-6', status: 'queued', to: 'implementer#11' },
            { id: 'msg-7', status: 'refused', to: 'implementer#11' },
        ])
        expect(messages[1]).toEqual({
            ticket: 11,
            role: 'test-writer',
            id: 'msg-2',
            from: 'test-writer#11',
            to: 'implementer#11',
            text: first,
            status: 'queued',
            recipients: ['implementer#11'],
            reason: null,
        })

        // The implementer got all five at its first tool call, and only then.
        const deliveries = records.flatMap((record) =>
            record.kind === 'agent_message_delivered'
                ? [
                      {
                          ticket: record.ticket,
                          role: record.role,
                          ...record.content,
                      },
                  ]
                : []
        )
        expect(deliveries).toEqual([
            {
                ticket: 11,
                role: 'implementer',
                to: 'implementer#11',
                ids: ['msg-2', 'msg-3', 'msg-4', 'msg-5', 'msg-6'],
                tool_name: 'Read',
                text: implementerGot[0] ?? '',
            },
        ])
        expect(implementerGot[0]).toContain(`from test-writer#11`)
        expect(implementerGot[0]).toContain(first)
        expect(implementerGot[1]).toBeNull()
        // It saw them during its turn: after it started, before it finished.
        const seqOf = (kind: string, role: string | null) =>
            records.find(
                (record) => record.kind === kind && record.role === role
            )?.seq ?? 0
        const seen = seqOf('agent_message_delivered', 'implementer')
        expect(seen).toBeGreaterThan(seqOf('agent_started', 'implementer'))
        expect(seen).toBeLessThan(seqOf('agent_finished', 'implementer'))

        // The reviewer has no messaging: it can't send, and gets nothing.
        expect(reviewerGot).toEqual([null])
        // (The final review's five lenses, spec #10's, get nothing either.)
        expect(launcher.launches().map(({ delivered }) => delivered)).toEqual([
            [],
            [implementerGot[0] ?? ''],
            [],
            ...Array.from({ length: 5 }, () => []),
        ])

        // The implementer's prompt names its address; the reviewer's names none.
        const prompts = launcher.launches().map(({ prompt }) => prompt)
        expect(prompts[0]).toContain(
            'Your address for agent messages: test-writer#11'
        )
        expect(prompts[1]).toContain(
            'Your address for agent messages: implementer#11'
        )
        expect(prompts[2]).not.toContain('Your address for agent messages')
    }, 60_000)
})
