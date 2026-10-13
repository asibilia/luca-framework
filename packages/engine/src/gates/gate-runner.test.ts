import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

describe('prepareCheck: one at a time (#492)', () => {
    test('with a cap of 1, two prepare runs never overlap, and waiting for a turn does not count toward the time limit', async () => {
        const folder = await mkdtemp(join(tmpdir(), 'luca-prepare-slots-'))
        try {
            const log = join(folder, 'log')
            // Each run takes 0.6 seconds of a 1-second limit; the second
            // waits 0.6 seconds first, 1.2 seconds in all.
            const config = EngineConfigSchema.parse({
                prepare: `echo start >> ${log}; sleep 0.6; echo end >> ${log}`,
                prepare_timeout_ms: 1_000,
                prepare_concurrency: 1,
            })

            const checks = await Promise.all([
                prepareCheck({ config, cwd: folder }),
                prepareCheck({ config, cwd: folder }),
            ])

            expect(checks.map((check) => check?.ok)).toEqual([true, true])
            expect((await Bun.file(log).text()).split('\n')).toEqual([
                'start',
                'end',
                'start',
                'end',
                '',
            ])
        } finally {
            await rm(folder, { recursive: true, force: true })
        }
    }, 20_000)
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
