import { describe, expect, test } from 'bun:test'

import { createClaudeLauncher, type AgentQuery } from './claude-launcher'
import {
    CLAUDE_PATH,
    CONFIG,
    fakeQuery,
    IMPLEMENTER_DONE,
    INIT,
    repo,
    repoPerTest,
    result,
} from './claude-launcher-helpers'

import { JournalRecordSchema } from '../journal/journal-record'

/**
 * The launcher seam, the follow-ups: a follow-up reaches its session, and a
 * session closes when it is told to or sits idle. The helpers are in
 * `claude-launcher-helpers.ts`.
 */

repoPerTest()

describe('follow-ups', () => {
    const launcherFor = (query: AgentQuery, idle_timeout_ms?: number) =>
        createClaudeLauncher({
            query,
            claude_path: CLAUDE_PATH,
            idle_timeout_ms,
        })

    const launchImplementer = (
        launcher: ReturnType<typeof createClaudeLauncher>
    ) =>
        launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'Build ticket #11.',
            cwd: repo,
            may_edit_tests: false,
            config: CONFIG,
            messaging: null,
            model: 'opus',
        })

    const followUp = (
        launcher: ReturnType<typeof createClaudeLauncher>,
        session_id: string
    ) =>
        launcher.followUp({
            session_id,
            role: 'implementer',
            ticket: 11,
            message: 'lint failed: fix it.',
            cwd: repo,
            config: CONFIG,
        })

    test('a follow-up reaches the same session and returns its second result', async () => {
        const fake = fakeQuery({
            turns: [
                [INIT, result({ structured_output: { n: 1 } })],
                [result({ structured_output: IMPLEMENTER_DONE, num_turns: 5 })],
            ],
        })
        const launcher = launcherFor(fake.query)
        const first = await launchImplementer(launcher)
        const second = await followUp(launcher, 'session-1')
        await launcher.closeAll()

        expect(first).toMatchObject({
            ok: true,
            session_id: 'session-1',
            structured_output: { n: 1 },
        })
        expect(second).toMatchObject({
            ok: true,
            session_id: 'session-1',
            structured_output: IMPLEMENTER_DONE,
        })
        expect(second.session).toMatchObject({
            session_id: 'session-1',
            model: 'claude-opus-5-5',
            num_turns: 5,
        })
        expect(fake.calls).toHaveLength(1)
        expect(
            fake.calls[0]?.prompts.map(({ message }) => message.content)
        ).toEqual(['Build ticket #11.', 'lint failed: fix it.'])
        expect(fake.calls[0]?.closed).toBe(true)
    })

    test("each turn's session id is the one the session's init names", async () => {
        const fake = fakeQuery({
            turns: [[{ ...INIT, session_id: 'abc-123' }, result({})]],
        })
        const launcher = launcherFor(fake.query)
        const turn = await launchImplementer(launcher)
        await launcher.closeAll()
        expect(turn.session_id).toBe('abc-123')
    })

    test('a follow-up to an unknown session is an engine failure', async () => {
        const fake = fakeQuery({})
        const turn = await followUp(launcherFor(fake.query), 'nope')
        expect(turn).toMatchObject({
            ok: false,
            failure: 'engine',
            session_id: 'nope',
        })
        expect(fake.calls).toHaveLength(0)
    })

    test('a session with no init id can take no follow-up', async () => {
        const fake = fakeQuery({
            turns: [[{ ...INIT, session_id: null }, result({})]],
        })
        const launcher = launcherFor(fake.query)
        const turn = await launchImplementer(launcher)
        expect(turn.session_id).toStartWith('claude-launch-')
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, turn.session_id ?? '')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })

    test('a rejected limit in a follow-up cuts it off as the plan, and closes the session', async () => {
        const fake = fakeQuery({
            turns: [
                [INIT, result({ structured_output: { n: 1 } })],
                [
                    {
                        type: 'rate_limit_event',
                        rate_limit_info: {
                            status: 'rejected',
                            rateLimitType: 'five_hour',
                        },
                    },
                ],
            ],
        })
        const launcher = launcherFor(fake.query)
        await launchImplementer(launcher)
        const turn = await followUp(launcher, 'session-1')
        expect(turn).toMatchObject({ ok: false, failure: 'plan' })
        expect(turn.session?.rate_limit_events).toMatchObject([
            { status: 'rejected', rateLimitType: 'five_hour' },
        ])
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })

    test('closeAll closes every open session', async () => {
        const fake = fakeQuery({ turns: [[INIT, result({})]] })
        const launcher = launcherFor(fake.query)
        await launchImplementer(launcher)
        expect(fake.calls[0]?.closed).toBe(false)
        await launcher.closeAll()
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })

    test('closeSession closes that one session, so it takes no more follow-ups', async () => {
        const fake = fakeQuery({ turns: [[INIT, result({})]] })
        const launcher = launcherFor(fake.query)
        await launchImplementer(launcher)
        expect(fake.calls[0]?.closed).toBe(false)

        await launcher.closeSession({ session_id: 'session-1' })

        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })

    test('closing a session the launcher does not know does nothing', async () => {
        const fake = fakeQuery({
            turns: [
                [INIT, result({ structured_output: { n: 1 } })],
                [result({ structured_output: IMPLEMENTER_DONE })],
            ],
        })
        const launcher = launcherFor(fake.query)
        await launchImplementer(launcher)

        await launcher.closeSession({ session_id: 'from-an-engine-that-died' })

        expect(fake.calls[0]?.closed).toBe(false)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: true,
            session_id: 'session-1',
        })
        await launcher.closeAll()
    })

    test('a follow-up to a closed or unknown session says the session is gone (#521)', async () => {
        const fake = fakeQuery({ turns: [[INIT, result({})]] })
        const launcher = launcherFor(fake.query)
        await launchImplementer(launcher)
        await launcher.closeSession({ session_id: 'session-1' })

        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            session_gone: true,
            session_id: 'session-1',
        })
        expect(await followUp(launcher, 'nope')).toMatchObject({
            ok: false,
            session_gone: true,
            session_id: 'nope',
        })
        expect(fake.calls[0]?.prompts).toHaveLength(1)
    })

    test('an agent_failed records session_gone, and one from a journal before #521 reads it as false', () => {
        const recordWith = (extra: object) =>
            JournalRecordSchema.parse({
                seq: 1,
                time: new Date(0).toISOString(),
                kind: 'agent_failed',
                ticket: 11,
                role: 'implementer',
                content: {
                    role: 'implementer',
                    error: 'It broke.',
                    failure: 'engine',
                    session_id: 'session-1',
                    ...extra,
                },
            })
        const gone = recordWith({ session_gone: true })
        const old = recordWith({})
        if (gone.kind !== 'agent_failed' || old.kind !== 'agent_failed') {
            throw new Error('agent_failed')
        }

        expect(gone.content).toMatchObject({ session_gone: true })
        expect(old.content).toMatchObject({ session_gone: false })
    })

    test('a session idle past its timeout closes', async () => {
        const fake = fakeQuery({ turns: [[INIT, result({})]] })
        const launcher = launcherFor(fake.query, 20)
        await launchImplementer(launcher)
        await Bun.sleep(60)
        expect(fake.calls[0]?.closed).toBe(true)
        expect(await followUp(launcher, 'session-1')).toMatchObject({
            ok: false,
            failure: 'engine',
        })
    })
})
