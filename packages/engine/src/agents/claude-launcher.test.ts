import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { createClaudeLauncher } from './claude-launcher'
import {
    CLAUDE_PATH,
    CONFIG,
    MAX_ACCOUNT,
    fakeQuery,
    INIT,
    launch,
    repo,
    repoPerTest,
    result,
} from './claude-launcher-helpers'
import type { AgentRole } from './role-results'

/**
 * The launcher seam: `createClaudeLauncher` with a fake `query` that plays
 * back SDK-shaped messages, and a fake `claude` path. No model, no process.
 *
 * Here: the model and the credentials check. The options are in
 * `claude-launcher-options.test.ts`. The rest are in
 * `claude-launcher-*.test.ts`, and the helpers they share are in
 * `claude-launcher-helpers.ts`.
 */

repoPerTest()

describe('the model', () => {
    // The `opus` row refuses every spelling of opus but the exact short name,
    // which starts: see "before a launch, accepts opus, sonnet and haiku".
    test.each([
        ['claude-fable-5', ['claude-fable-5']],
        ['CLAUDE-FABLE-5-1', ['CLAUDE-FABLE-5-1']],
        ['gpt-5', ['gpt-5']],
        ['opus', ['OPUS', 'Opus', 'opus[1m]', 'opusplan']],
    ] as const)(
        'refuses %s without starting a session',
        async (_name, models) => {
            const fake = fakeQuery({})
            for (const model of models) {
                const turn = await launch({ query: fake.query, model })
                expect({ model, turn }).toMatchObject({
                    model,
                    turn: { ok: false, failure: 'stop' },
                })
            }
            expect(fake.calls).toHaveLength(0)
        }
    )

    test('runs every role on Claude Opus 5.5 at the same effort', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        for (const role of [
            'test-writer',
            'implementer',
            'ticket-reviewer',
        ] as const) {
            await launch({ query: fake.query, role })
        }
        const models = fake.calls.map(({ options }) => options.model)
        expect(models).toHaveLength(3)
        expect(new Set(models).size).toBe(1)
        expect(models[0]).toMatch(/opus/)
        expect(fake.calls.map(({ options }) => options.effort)).toEqual([
            'high',
            'high',
            'high',
        ])
    })

    /** One launch on `model`, on a launcher shared across launches. */
    const launchOn = ({
        launcher,
        role,
        model,
    }: {
        launcher: ReturnType<typeof createClaudeLauncher>
        role: AgentRole
        model: string
    }) =>
        launcher.launch({
            role,
            ticket: 11,
            prompt: 'Work on ticket #11.',
            cwd: repo,
            may_edit_tests: role === 'test-writer',
            config: CONFIG,
            messaging: null,
            model,
        })

    test('before a launch, accepts opus, sonnet and haiku, and runs each launch on its own model at the same effort', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        const launcher = createClaudeLauncher({
            query: fake.query,
            claude_path: CLAUDE_PATH,
        })
        const turns = [
            await launchOn({ launcher, role: 'test-writer', model: 'sonnet' }),
            await launchOn({ launcher, role: 'implementer', model: 'haiku' }),
            await launchOn({
                launcher,
                role: 'ticket-reviewer',
                model: 'opus',
            }),
        ]
        await launcher.closeAll()

        expect(turns.map(({ ok }) => ok)).toEqual([true, true, true])
        expect(fake.calls.map(({ options }) => options.model)).toEqual([
            'sonnet',
            'haiku',
            'opus',
        ])
        expect(fake.calls.map(({ options }) => options.effort)).toEqual([
            'high',
            'high',
            'high',
        ])
    })

    test('before a launch, refuses fable, every other short name, and a full model id, without starting a session', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        const launcher = createClaudeLauncher({
            query: fake.query,
            claude_path: CLAUDE_PATH,
        })
        for (const model of [
            'fable',
            'best',
            'default',
            'opusplan',
            'opus[1m]',
            'claude-fable-5-1',
            'CLAUDE-FABLE-5-1',
            'claude-opus-5-5',
            'gpt-5',
        ]) {
            const turn = await launchOn({
                launcher,
                role: 'ticket-reviewer',
                model,
            })
            expect({ model, turn }).toMatchObject({
                model,
                turn: { ok: false, failure: 'stop' },
            })
        }
        expect(fake.calls).toHaveLength(0)
    })

    test("on the session's init, accepts a full Claude model id that isn't Fable, keeps that exact version, and refuses a Fable id", async () => {
        const sonnet = fakeQuery({
            messages: [
                { ...INIT, model: 'claude-sonnet-5-5' },
                result({ structured_output: { n: 1 } }),
            ],
        })
        const fable = fakeQuery({
            messages: [
                { ...INIT, model: 'claude-fable-5-1' },
                result({ structured_output: { n: 1 } }),
            ],
        })
        const runs = []
        for (const { query } of [sonnet, fable]) {
            const launcher = createClaudeLauncher({
                query,
                claude_path: CLAUDE_PATH,
            })
            runs.push(
                await launchOn({
                    launcher,
                    role: 'implementer',
                    model: 'sonnet',
                })
            )
            await launcher.closeAll()
        }
        const [ran, refused] = runs

        expect(sonnet.calls[0]?.options.model).toBe('sonnet')
        expect(ran).toMatchObject({ ok: true, structured_output: { n: 1 } })
        expect(ran?.session?.model).toBe('claude-sonnet-5-5')
        expect(refused).toMatchObject({ ok: false, failure: 'stop' })
        expect(fable.calls[0]?.closed).toBe(true)
    })

    test("a follow-up runs in the session its launch started, on that launch's model", async () => {
        const fake = fakeQuery({
            turns: [
                [
                    { ...INIT, model: 'claude-haiku-4-6' },
                    result({ structured_output: { n: 1 } }),
                ],
                [result({ structured_output: { n: 2 } })],
            ],
        })
        const launcher = createClaudeLauncher({
            query: fake.query,
            claude_path: CLAUDE_PATH,
        })
        const first = await launchOn({
            launcher,
            role: 'implementer',
            model: 'haiku',
        })
        const second = await launcher.followUp({
            session_id: 'session-1',
            role: 'implementer',
            ticket: 11,
            message: 'lint failed: fix it.',
            cwd: repo,
            config: CONFIG,
        })
        await launcher.closeAll()

        expect(first).toMatchObject({ ok: true })
        expect(second).toMatchObject({ ok: true, structured_output: { n: 2 } })
        expect(fake.calls).toHaveLength(1)
        expect(fake.calls[0]?.options.model).toBe('haiku')
        expect(second.session?.model).toBe('claude-haiku-4-6')
    })

    test('no engine source names a model version', async () => {
        const src = join(import.meta.dir, '..')
        const named: string[] = []
        for await (const path of new Bun.Glob('**/*.ts').scan({ cwd: src })) {
            if (path.endsWith('.test.ts') || path.endsWith('-helpers.ts'))
                continue
            if (path.startsWith('testing/')) continue
            const text = await Bun.file(join(src, path)).text()
            const found = text.match(/claude-(opus|sonnet|haiku)-\d[\w-]*/g)
            if (found !== null) named.push(`${path}: ${found.join(', ')}`)
        }
        expect(named).toEqual([])
    })
})

describe('credentials, before any prompt', () => {
    const cases: [string, Record<string, unknown>][] = [
        ['an API key', { ...MAX_ACCOUNT, apiKeySource: 'ANTHROPIC_API_KEY' }],
        ['no subscription', { email: 'me@example.com', apiKeySource: 'none' }],
        ['a free account', { ...MAX_ACCOUNT, subscriptionType: 'free' }],
        ['a cloud provider', { ...MAX_ACCOUNT, apiProvider: 'bedrock' }],
    ]
    test.each(cases)('refuses %s', async (_, account) => {
        const fake = fakeQuery({ account, messages: [INIT, result({})] })
        const turn = await launch({ query: fake.query })
        expect(turn).toMatchObject({ ok: false, failure: 'stop' })
        expect(fake.calls[0]?.prompts).toEqual([])
        expect(fake.calls[0]?.closed).toBe(true)
    })

    test('checks the account before it sends the prompt', async () => {
        const fake = fakeQuery({ messages: [INIT, result({})] })
        await launch({ query: fake.query })
        expect(fake.calls[0]?.account_checked_before_prompt).toBe(true)
        expect(fake.calls[0]?.prompts).toHaveLength(1)
    })
})
