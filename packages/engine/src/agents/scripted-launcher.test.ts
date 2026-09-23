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
        })
        const second = await launcher.launch({
            role: 'test-writer',
            ticket: 11,
            prompt: 'p',
            cwd,
            may_edit_tests: true,
            config: BUILD_CONFIG,
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
            },
            {
                kind: 'follow_up',
                role: 'implementer',
                ticket: 11,
                prompt: 'lint failed',
                session_id: first.session_id,
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
