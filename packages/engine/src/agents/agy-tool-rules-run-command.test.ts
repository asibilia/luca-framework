import { describe, expect, test } from 'bun:test'

import { checkAgyToolCall, type AgyGuardState } from './agy-tool-rules'

import { EngineConfigSchema } from '../config/engine-config'
import { guardRoleOf } from '../guards/role-rules'

/**
 * `run_command` beyond `checkBash` (#777): the best-effort textual guard on
 * secret and state paths (agy's `--sandbox` has no deny-read config), and
 * agy's `Cwd`, which must stay inside the worktree and is where relative
 * paths resolve.
 */

const CONFIG = EngineConfigSchema.parse({
    checks: { test: 'bun test', types: 'bunx --bun tsc --noEmit' },
    test_file_patterns: ['src/**/*.test.ts'],
    test_setup_files: ['src/test-setup.ts'],
})

const STATE: AgyGuardState = {
    role: 'implementer',
    guard_role: guardRoleOf({ role: 'implementer' }),
    worktree_real: '/runs/run-1/tickets/11',
    state_dir_real: '/tmp/luca-agy-abc',
    home_real: '/Users/me',
    may_edit_tests: false,
    config: CONFIG,
}

const run = (tool_input: Record<string, unknown>, state = STATE) =>
    checkAgyToolCall({ state, tool_name: 'run_command', tool_input })

const SECRET = { allow: false, reason: 'Commands may not touch secret files.' }
const GUARD_STATE = {
    allow: false,
    reason: "Commands may not touch Luca's guard state.",
}

describe('run_command textual guard on secret and state paths', () => {
    test('denies a command line naming a secret path, however home is spelled', () => {
        for (const CommandLine of [
            'cat ~/.ssh/id_rsa',
            'cat ~/.gemini/oauth_creds.json',
            'cat /Users/me/.claude.json',
            'cat $HOME/.config/gh/hosts.yml',
            'cat ${HOME}/.paseo',
            'cat "$HOME"/.ssh/id_rsa',
            "cat ~/'.ssh'/id_rsa",
            'cat ~//.ssh/./id_rsa',
            'head -n 1 ~/.claude',
        ]) {
            expect(run({ CommandLine })).toEqual(SECRET)
        }
    })

    test('denies a command line naming the state directory or its variable', () => {
        for (const CommandLine of [
            'cat /tmp/luca-agy-abc/state.json',
            'cat $LUCA_AGY_STATE_DIR/state.json',
            'cat ${LUCA_AGY_STATE_DIR}/denials.jsonl',
            'ls /tmp/luca-agy-abc',
        ]) {
            expect(run({ CommandLine })).toEqual(GUARD_STATE)
        }
    })

    test('allows commands that only look alike', () => {
        for (const CommandLine of [
            'cat src/.ssh-notes.md',
            'cat ~/.sshx',
            'ls /tmp/luca-agy-abcdef',
            'grep -r HOME src',
            'bun test',
        ]) {
            expect(run({ CommandLine })).toEqual({ allow: true })
        }
    })
})

describe('run_command Cwd', () => {
    test('allows a Cwd inside the worktree, absolute or relative', () => {
        for (const Cwd of [
            '/runs/run-1/tickets/11',
            '/runs/run-1/tickets/11/src',
            'src',
            '',
            null,
        ]) {
            expect(run({ CommandLine: 'git status', Cwd })).toEqual({
                allow: true,
            })
        }
    })

    test('denies a Cwd outside the worktree, in the state dir, or under a secret', () => {
        expect(run({ CommandLine: 'ls', Cwd: '/Users/me' })).toEqual({
            allow: false,
            reason: '/Users/me is outside your worktree.',
        })
        expect(run({ CommandLine: 'ls', Cwd: '../12' })).toEqual({
            allow: false,
            reason: '../12 is outside your worktree.',
        })
        expect(run({ CommandLine: 'ls', Cwd: '/tmp/luca-agy-abc' })).toEqual({
            allow: false,
            reason: '/tmp/luca-agy-abc is outside your worktree.',
        })
        expect(run({ CommandLine: 'ls', Cwd: '/Users/me/.ssh' })).toEqual({
            allow: false,
            reason: 'Reading secret files is not allowed.',
        })
    })

    test('resolves rm paths from the Cwd, so a test file in a subfolder stays protected', () => {
        expect(run({ CommandLine: 'rm src/app.test.ts' }).allow).toBe(false)
        expect(run({ CommandLine: 'rm app.test.ts', Cwd: 'src' })).toEqual({
            allow: false,
            reason: 'A implementer may not delete src/app.test.ts.',
        })
        expect(run({ CommandLine: 'rm app.ts', Cwd: 'src' })).toEqual({
            allow: true,
        })
        expect(run({ CommandLine: 'rm ../../x.ts', Cwd: 'src' }).allow).toBe(
            false
        )
    })
})
