import { tmpdir } from 'node:os'

import { describe, expect, test } from 'bun:test'

import { prepareCheck, shellCheck } from './gate-runner'

import { EngineConfigSchema } from '../config/engine-config'

/**
 * The prepare command's time limit (#485): `prepare_timeout_ms` from the
 * config reaches the command, and a prepare that runs out of time says so.
 */

describe('prepareCheck', () => {
    test("stops the prepare command at the config's time limit and says how to raise it", async () => {
        const config = EngineConfigSchema.parse({
            prepare: 'sleep 20',
            prepare_timeout_ms: 300,
        })
        const started = Date.now()

        const check = await prepareCheck({ config, cwd: tmpdir() })

        expect(Date.now() - started).toBeLessThan(5_000)
        expect(check).toMatchObject({
            name: 'prepare',
            command: 'sleep 20',
            ok: false,
            exit_code: null,
        })
        expect(check?.output).toContain('Timed out after 0.3 seconds')
        expect(check?.output).toContain('`prepare_timeout_ms`')
        expect(check?.output).toContain('`.luca/config.json`')
    }, 20_000)

    test('a prepare that finishes in time passes with no output', async () => {
        const config = EngineConfigSchema.parse({ prepare: 'echo built' })

        const check = await prepareCheck({ config, cwd: tmpdir() })

        expect(check).toEqual({
            name: 'prepare',
            command: 'echo built',
            ok: true,
            exit_code: 0,
            output: '',
        })
    })
})

describe('shellCheck', () => {
    test('a check that times out says so, with no hint about prepare', async () => {
        const check = await shellCheck({
            name: 'lint',
            command: 'echo started; sleep 20',
            cwd: tmpdir(),
            timeout_ms: 300,
        })

        expect(check.ok).toBe(false)
        expect(check.exit_code).toBeNull()
        expect(check.output).toContain('Timed out after 0.3 seconds')
        expect(check.output).toContain('started')
        expect(check.output).not.toContain('prepare_timeout_ms')
    }, 20_000)
})
