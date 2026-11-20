import { afterEach, describe, expect, test } from 'bun:test'

import { engineArgs, parseRunArgs } from './engine-launch'
import { createHarness, type Harness } from './testing/board-harness'

import { RUN_USAGE } from '../shared/board-state'

let harness: Harness | null = null

afterEach(async () => {
    if (harness !== null) {
        await harness.cleanup()
        harness = null
    }
})

describe('Tier 1 — Paseo /luca-run --provider parsing, forwarding, and harness', () => {
    test('RUN_USAGE documents optional --provider <claude|agy> on spec runs', () => {
        expect(RUN_USAGE).toBe(
            '/luca-run <spec number> [--provider <claude|agy>] | demo | resume <run id>'
        )
    })

    test('parseRunArgs accepts spec numbers with --provider <id> and --provider=<id> case-insensitively', () => {
        expect(parseRunArgs({ args: '123 --provider agy' })).toEqual({
            ok: true,
            target: { kind: 'spec', spec: 123, provider: 'agy' },
        })
        expect(parseRunArgs({ args: '#42 --provider=claude' })).toEqual({
            ok: true,
            target: { kind: 'spec', spec: 42, provider: 'claude' },
        })
        expect(parseRunArgs({ args: '  #7   --provider   AGY  ' })).toEqual({
            ok: true,
            target: { kind: 'spec', spec: 7, provider: 'agy' },
        })
        expect(parseRunArgs({ args: '99 --provider=Claude' })).toEqual({
            ok: true,
            target: { kind: 'spec', spec: 99, provider: 'claude' },
        })
    })

    test('parseRunArgs preserves spec, demo, and resume targets without injecting provider', () => {
        const plain = parseRunArgs({ args: '42' })
        expect(plain).toEqual({
            ok: true,
            target: { kind: 'spec', spec: 42 },
        })
        if (plain.ok) {
            expect('provider' in plain.target).toBe(false)
        }
        expect(parseRunArgs({ args: 'demo' })).toEqual({
            ok: true,
            target: { kind: 'demo' },
        })
        expect(
            parseRunArgs({ args: 'resume luca-20260928-124805-69hp' })
        ).toEqual({
            ok: true,
            target: { kind: 'resume', run_id: 'luca-20260928-124805-69hp' },
        })
    })

    test('engineArgs appends --provider <id> only when target is a spec with provider set', () => {
        expect(
            engineArgs({
                target: { kind: 'spec', spec: 42, provider: 'agy' },
                repo: '/repo',
                run_id: 'r1',
            })
        ).toEqual([
            '--spec',
            '42',
            '--provider',
            'agy',
            '--repo',
            '/repo',
            '--run-id',
            'r1',
            '--board-plugin',
            'luca-board',
        ])
        expect(
            engineArgs({
                target: { kind: 'spec', spec: 42, provider: 'claude' },
                repo: '/repo',
                run_id: 'r2',
            })
        ).toEqual([
            '--spec',
            '42',
            '--provider',
            'claude',
            '--repo',
            '/repo',
            '--run-id',
            'r2',
            '--board-plugin',
            'luca-board',
        ])
        expect(
            engineArgs({
                target: { kind: 'spec', spec: 42 },
                repo: '/repo',
                run_id: 'r3',
            })
        ).toEqual([
            '--spec',
            '42',
            '--repo',
            '/repo',
            '--run-id',
            'r3',
            '--board-plugin',
            'luca-board',
        ])
        expect(
            engineArgs({
                target: { kind: 'demo' },
                repo: '/repo',
                run_id: 'r4',
            })
        ).toEqual([
            '--demo',
            '--repo',
            '/repo',
            '--run-id',
            'r4',
            '--board-plugin',
            'luca-board',
        ])
    })

    test('createHarness().start forwards --provider agy and --provider claude in spawned engine args without binding ports', async () => {
        harness = await createHarness()

        const first = await harness.start({
            args: '#42 --provider=AGY',
            cwd: '/Users/me/repo',
        })
        const second = await harness.start({
            args: '15 --provider claude',
            cwd: '/Users/me/repo',
        })

        expect(first.output.ok).toBe(true)
        expect(second.output.ok).toBe(true)
        expect(harness.spawns).toHaveLength(2)
        expect(harness.spawns[0]?.args.slice(-10)).toEqual([
            '--spec',
            '42',
            '--provider',
            'agy',
            '--repo',
            '/Users/me/repo',
            '--run-id',
            first.run_id,
            '--board-plugin',
            'luca-board',
        ])
        expect(harness.spawns[1]?.args.slice(-10)).toEqual([
            '--spec',
            '15',
            '--provider',
            'claude',
            '--repo',
            '/Users/me/repo',
            '--run-id',
            second.run_id,
            '--board-plugin',
            'luca-board',
        ])
    })
})

describe('Tier 2 — Paseo /luca-run --provider validation boundaries', () => {
    test('parseRunArgs rejects demo with --provider using exact RUN_USAGE error', () => {
        const expected = `--provider isn't used with demo. Usage: ${RUN_USAGE}`
        expect(parseRunArgs({ args: 'demo --provider agy' })).toEqual({
            ok: false,
            message: expected,
        })
        expect(parseRunArgs({ args: 'DEMO --provider=claude' })).toEqual({
            ok: false,
            message: expected,
        })
        expect(parseRunArgs({ args: 'demo --provider=AGY' })).toEqual({
            ok: false,
            message: expected,
        })
    })

    test('parseRunArgs rejects resume with --provider using exact RUN_USAGE error', () => {
        const expected = `--provider isn't used with resume (resumed runs keep their original provider). Usage: ${RUN_USAGE}`
        expect(parseRunArgs({ args: 'resume luca-1 --provider agy' })).toEqual({
            ok: false,
            message: expected,
        })
        expect(
            parseRunArgs({ args: 'RESUME luca-1 --provider=claude' })
        ).toEqual({
            ok: false,
            message: expected,
        })
    })

    test('parseRunArgs rejects missing or empty --provider values', () => {
        const expected = `Invalid --provider: expected claude or agy. Usage: ${RUN_USAGE}`
        for (const args of [
            '42 --provider',
            '42 --provider=',
            '#42 --provider   ',
        ]) {
            expect(parseRunArgs({ args })).toEqual({
                ok: false,
                message: expected,
            })
        }
    })

    test('parseRunArgs rejects unsupported provider values', () => {
        const expected = `Invalid --provider: expected claude or agy. Usage: ${RUN_USAGE}`
        for (const args of [
            '42 --provider openai',
            '42 --provider=gemini',
            '42 --provider=gemini-4-neon-high',
            '42 --provider=123',
        ]) {
            expect(parseRunArgs({ args })).toEqual({
                ok: false,
                message: expected,
            })
        }
    })

    test('parseRunArgs rejects reordered flags, duplicate flags, and extra trailing tokens', () => {
        for (const args of [
            '--provider agy 42',
            '42 --provider agy extra',
            '42 --provider agy --provider claude',
        ]) {
            const parsed = parseRunArgs({ args })
            expect(parsed.ok).toBe(false)
            if (!parsed.ok) {
                expect(parsed.message).toContain(RUN_USAGE)
            }
        }
    })

    test('parseRunArgs rejects invalid spec numbers paired with valid --provider', () => {
        for (const args of [
            '0 --provider agy',
            '-5 --provider agy',
            'abc --provider agy',
            '# --provider agy',
        ]) {
            const parsed = parseRunArgs({ args })
            expect(parsed.ok).toBe(false)
            if (!parsed.ok) {
                expect(parsed.message).toContain(RUN_USAGE)
            }
        }
    })

    test('createHarness().start refuses invalid --provider inputs before spawning or writing runs', async () => {
        harness = await createHarness()

        for (const args of [
            'demo --provider agy',
            'resume luca-1 --provider agy',
            '42 --provider openai',
            '42 --provider',
        ]) {
            const { output } = await harness.start({ args })
            expect(output.ok).toBe(false)
            expect(output.run_id).toBeNull()
            expect(output.message).toContain(RUN_USAGE)
        }

        expect(harness.spawns).toEqual([])
        expect(harness.rows).toEqual([])
        expect((await harness.read()).runs).toEqual([])
    })
})
