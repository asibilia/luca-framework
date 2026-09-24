import { $ } from 'bun'

import { describe, expect, test } from 'bun:test'

import { parseRunArgs } from './run-args'

import { runBranchName } from '../core/execute-build'
import { runJournalPath } from '../journal/journal'

const PLUGIN_RUN_ID = 'luca-20260923-141500-ab12'

describe('luca-run arguments', () => {
    test('a real run as the board plugin launches it', () => {
        const result = parseRunArgs({
            argv: [
                '--spec',
                '374',
                '--repo',
                '/code/app',
                '--run-id',
                PLUGIN_RUN_ID,
                '--board-plugin',
                'luca-board',
            ],
            cwd: '/somewhere/else',
            env: { LUCA_BOARD_TOKEN: 'secret' },
        })

        expect(result).toEqual({
            ok: true,
            args: {
                mode: 'spec',
                spec_number: 374,
                repo: '/code/app',
                run_id: PLUGIN_RUN_ID,
                base_branch: null,
                board: { plugin_id: 'luca-board', token: 'secret' },
            },
        })
    })

    test('a demo with no board runs in the current folder with a new run id', () => {
        const result = parseRunArgs({
            argv: ['--demo'],
            cwd: '/code/app',
            env: {},
        })

        expect(result).toMatchObject({
            ok: true,
            args: { mode: 'demo', repo: '/code/app', board: null },
        })
        expect(result.ok && result.args.run_id).toMatch(/^\d{8}t\d{6}z-/)
    })

    test('a relative repo is taken from the current folder', () => {
        const result = parseRunArgs({
            argv: ['--spec', '12', '--repo', 'app', '--base', 'develop'],
            cwd: '/code',
            env: {},
        })

        expect(result).toMatchObject({
            ok: true,
            args: { repo: '/code/app', base_branch: 'develop' },
        })
    })

    test('a resume names the run; the repo is left to the journal unless given', () => {
        expect(
            parseRunArgs({
                argv: ['--resume', PLUGIN_RUN_ID],
                cwd: '/code',
                env: {},
            })
        ).toEqual({
            ok: true,
            args: {
                mode: 'resume',
                run_id: PLUGIN_RUN_ID,
                repo: null,
                board: null,
            },
        })
        expect(
            parseRunArgs({
                argv: [
                    '--resume',
                    PLUGIN_RUN_ID,
                    '--repo',
                    'app',
                    '--board-plugin',
                    'luca-board',
                ],
                cwd: '/code',
                env: { LUCA_BOARD_TOKEN: 'secret' },
            })
        ).toEqual({
            ok: true,
            args: {
                mode: 'resume',
                run_id: PLUGIN_RUN_ID,
                repo: '/code/app',
                board: { plugin_id: 'luca-board', token: 'secret' },
            },
        })
    })

    test.each([
        { why: 'no mode', argv: [] },
        { why: 'both modes', argv: ['--demo', '--spec', '3'] },
        { why: 'a resume and a spec', argv: ['--resume', 'r1', '--spec', '3'] },
        { why: 'a resume and a demo', argv: ['--resume', 'r1', '--demo'] },
        {
            why: 'a resume with a run id',
            argv: ['--resume', 'r1', '--run-id', 'r2'],
        },
        {
            why: 'a resume with a base',
            argv: ['--resume', 'r1', '--base', 'dev'],
        },
        { why: 'a resume of a bad run id', argv: ['--resume', '../x'] },
        { why: 'a spec that is not a number', argv: ['--spec', 'abc'] },
        { why: 'an unknown flag', argv: ['--demo', '--fast'] },
        { why: 'a run id with a slash', argv: ['--demo', '--run-id', '../x'] },
        {
            why: 'a board with no token',
            argv: ['--demo', '--board-plugin', 'luca-board'],
        },
    ])('refuses $why', ({ argv }) => {
        const result = parseRunArgs({ argv, cwd: '/code', env: {} })

        expect(result.ok).toBe(false)
    })

    test('a plugin-minted run id makes a run folder and a valid branch name', async () => {
        expect(
            runJournalPath({ runs_dir: '/runs', run_id: PLUGIN_RUN_ID })
        ).toBe(`/runs/${PLUGIN_RUN_ID}/journal.jsonl`)
        const branch = runBranchName({
            spec_number: 374,
            run_id: PLUGIN_RUN_ID,
        })
        const check = await $`git check-ref-format --branch ${branch}`
            .quiet()
            .nothrow()
        expect(check.exitCode).toBe(0)
    })
})
