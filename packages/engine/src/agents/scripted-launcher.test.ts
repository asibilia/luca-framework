import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { createScriptedLauncher } from './scripted-launcher'

import { BUILD_CONFIG } from '../testing/build-fixtures'

let cwd = ''

beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'luca-scripted-launcher-'))
})

afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
})

describe('scripted launcher: follow-ups', () => {
    test('each launch starts a new session', async () => {
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'test-writer', ticket: 11, result: { n: 1 } },
                { role: 'test-writer', ticket: 11, result: { n: 2 } },
            ],
        })
        const first = await launcher.launch({
            role: 'test-writer',
            ticket: 11,
            prompt: 'p',
            cwd,
            may_edit_tests: true,
            config: BUILD_CONFIG,
            messaging: null,
        })
        const second = await launcher.launch({
            role: 'test-writer',
            ticket: 11,
            prompt: 'p',
            cwd,
            may_edit_tests: true,
            config: BUILD_CONFIG,
            messaging: null,
        })

        expect(first.ok && second.ok).toBe(true)
        if (!first.ok || !second.ok) return
        expect(first.session_id).not.toBe(second.session_id)
    })

    test('a follow-up takes the next turn and stays in the same session', async () => {
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'implementer', ticket: 11, result: { n: 1 } },
                {
                    role: 'implementer',
                    ticket: 11,
                    files: { 'a.ts': 'fixed' },
                    result: { n: 2 },
                },
            ],
        })
        const first = await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'p',
            cwd,
            may_edit_tests: false,
            config: BUILD_CONFIG,
            messaging: null,
        })
        if (!first.ok) throw new Error(first.error)
        const next = await launcher.followUp({
            session_id: first.session_id,
            role: 'implementer',
            ticket: 11,
            message: 'lint failed',
            cwd,
            config: BUILD_CONFIG,
        })

        expect(next).toEqual({
            ok: true,
            session_id: first.session_id,
            structured_output: { n: 2 },
        })
        expect(await Bun.file(join(cwd, 'a.ts')).text()).toBe('fixed')
        expect(launcher.launches()).toEqual([
            {
                kind: 'launch',
                role: 'implementer',
                ticket: 11,
                prompt: 'p',
                session_id: first.session_id,
                may_edit_tests: false,
                delivered: [],
            },
            {
                kind: 'follow_up',
                role: 'implementer',
                ticket: 11,
                prompt: 'lint failed',
                session_id: first.session_id,
                delivered: [],
            },
        ])
    })

    test('a follow-up to an unknown session fails', async () => {
        const launcher = createScriptedLauncher({
            turns: [{ role: 'implementer', ticket: 11, result: {} }],
        })

        expect(
            await launcher.followUp({
                session_id: 'nope',
                role: 'implementer',
                ticket: 11,
                message: 'm',
                cwd,
                config: BUILD_CONFIG,
            })
        ).toMatchObject({ ok: false, failure: 'engine', session_id: 'nope' })
    })

    test('a follow-up with no turn left fails', async () => {
        const launcher = createScriptedLauncher({
            turns: [{ role: 'implementer', ticket: 11, result: {} }],
        })
        const first = await launcher.launch({
            role: 'implementer',
            ticket: 11,
            prompt: 'p',
            cwd,
            may_edit_tests: false,
            config: BUILD_CONFIG,
            messaging: null,
        })
        if (!first.ok) throw new Error(first.error)

        expect(
            await launcher.followUp({
                session_id: first.session_id,
                role: 'implementer',
                ticket: 11,
                message: 'm',
                cwd,
                config: BUILD_CONFIG,
            })
        ).toMatchObject({ ok: false })
    })
})

describe('scripted launcher: closing sessions', () => {
    const launchOne = (
        launcher: ReturnType<typeof createScriptedLauncher>,
        role: 'test-writer' | 'implementer'
    ) =>
        launcher.launch({
            role,
            ticket: 11,
            prompt: 'p',
            cwd,
            may_edit_tests: role === 'test-writer',
            config: BUILD_CONFIG,
            messaging: null,
        })

    test('a launched session is counted as open until it is closed', async () => {
        const launcher = createScriptedLauncher({
            turns: [{ role: 'implementer', ticket: 11, result: {} }],
        })
        expect(launcher.openSessions()).toEqual([])

        const turn = await launchOne(launcher, 'implementer')
        if (!turn.ok) throw new Error(turn.error)
        expect(launcher.openSessions()).toEqual([turn.session_id])

        await launcher.closeSession({ session_id: turn.session_id })
        expect(launcher.openSessions()).toEqual([])
    })

    test('a follow-up stays in its session and opens no other', async () => {
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'implementer', ticket: 11, result: { n: 1 } },
                { role: 'implementer', ticket: 11, result: { n: 2 } },
            ],
        })
        const first = await launchOne(launcher, 'implementer')
        if (!first.ok) throw new Error(first.error)
        await launcher.followUp({
            session_id: first.session_id,
            role: 'implementer',
            ticket: 11,
            message: 'lint failed',
            cwd,
            config: BUILD_CONFIG,
        })

        expect(launcher.openSessions()).toEqual([first.session_id])
    })

    test('closing one session leaves the others open, oldest first', async () => {
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'test-writer', ticket: 11, result: {} },
                { role: 'implementer', ticket: 11, result: {} },
                { role: 'implementer', ticket: 11, result: {} },
            ],
        })
        const writer = await launchOne(launcher, 'test-writer')
        const first = await launchOne(launcher, 'implementer')
        const second = await launchOne(launcher, 'implementer')
        if (!writer.ok || !first.ok || !second.ok) throw new Error('turns')

        await launcher.closeSession({ session_id: first.session_id })

        expect(launcher.openSessions()).toEqual([
            writer.session_id,
            second.session_id,
        ])
    })

    test('a follow-up to a closed session is an engine failure and plays no turn', async () => {
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'implementer', ticket: 11, result: { n: 1 } },
                {
                    role: 'implementer',
                    ticket: 11,
                    files: { 'a.ts': 'fixed' },
                    result: { n: 2 },
                },
            ],
        })
        const first = await launchOne(launcher, 'implementer')
        if (!first.ok) throw new Error(first.error)
        await launcher.closeSession({ session_id: first.session_id })

        expect(
            await launcher.followUp({
                session_id: first.session_id,
                role: 'implementer',
                ticket: 11,
                message: 'lint failed',
                cwd,
                config: BUILD_CONFIG,
            })
        ).toMatchObject({
            ok: false,
            failure: 'engine',
            session_id: first.session_id,
        })
        expect(await Bun.file(join(cwd, 'a.ts')).exists()).toBe(false)
        expect(launcher.openSessions()).toEqual([])
    })

    test('closing a session it does not know, or one already closed, does nothing', async () => {
        const launcher = createScriptedLauncher({
            turns: [
                { role: 'implementer', ticket: 11, result: {} },
                { role: 'implementer', ticket: 11, result: {} },
            ],
        })
        const first = await launchOne(launcher, 'implementer')
        const second = await launchOne(launcher, 'implementer')
        if (!first.ok || !second.ok) throw new Error('turns')
        await launcher.closeSession({ session_id: first.session_id })

        await launcher.closeSession({ session_id: first.session_id })
        await launcher.closeSession({ session_id: 'from-an-engine-that-died' })

        expect(launcher.openSessions()).toEqual([second.session_id])
    })
})
