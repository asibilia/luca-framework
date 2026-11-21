import {
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    AGY_TURNS_FILE,
    AgyTurnCountSchema,
    runAgyHook,
    turnsUsed,
    type AgyHookState,
} from './agy-hook'

import { EngineConfigSchema } from '../config/engine-config'
import { guardRoleOf } from '../guards/role-rules'

/**
 * `PreInvocation`'s turn limit (#777): `agy` numbers invocations across a
 * whole `--conversation`, so a follow-up process counts from the first
 * `invocationNum` it sees; a missing or malformed one falls back to the
 * hook's own count, never to no limit.
 */

const FRESH = AgyTurnCountSchema.parse({})

const TERMINATE = {
    exit_code: 0,
    output: {
        terminationBehavior: 'terminate',
        injectSteps: [{ errorMessage: { userMessage: 'Turn limit reached.' } }],
    },
}

let dirs: string[] = []

afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
    dirs = []
})

const stateDirWith = ({
    max_turns,
    turn_index,
}: {
    max_turns: number
    turn_index: number
}): string => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'agy-hook-turns-')))
    dirs.push(dir)
    const state: AgyHookState = {
        role: 'implementer',
        guard_role: guardRoleOf({ role: 'implementer' }),
        cwd: dir,
        worktree_real: dir,
        state_dir_real: dir,
        home_real: dir,
        may_edit_tests: false,
        config: EngineConfigSchema.parse({
            checks: { test: 'bun test' },
            test_file_patterns: ['src/**/*.test.ts'],
        }),
        max_turns,
        instructions: 'x',
        turn_index,
    }
    writeFileSync(join(dir, 'state.json'), JSON.stringify(state))
    return dir
}

const invoke = (state_dir: string, invocationNum?: unknown) =>
    runAgyHook({
        stdin_text: JSON.stringify({
            hookEventName: 'PreInvocation',
            ...(invocationNum === undefined ? {} : { invocationNum }),
        }),
        state_dir,
    })

describe('turnsUsed', () => {
    test('a fresh conversation numbers from 0', () => {
        expect(
            turnsUsed({ invocation_num: 3, turn_index: 0, count: FRESH })
        ).toEqual({ used: 3, next: { baseline: null, calls: 1 } })
    })

    test('a follow-up counts from the first invocationNum it sees', () => {
        const first = turnsUsed({
            invocation_num: 40,
            turn_index: 1,
            count: FRESH,
        })
        expect(first).toEqual({ used: 0, next: { baseline: 40, calls: 1 } })
        expect(
            turnsUsed({ invocation_num: 43, turn_index: 1, count: first.next })
        ).toEqual({ used: 3, next: { baseline: 40, calls: 2 } })
    })

    test('a missing or malformed invocationNum uses the call count', () => {
        for (const invocation_num of [undefined, null, '5', Number.NaN]) {
            expect(
                turnsUsed({
                    invocation_num,
                    turn_index: 2,
                    count: { baseline: null, calls: 4 },
                })
            ).toEqual({ used: 4, next: { baseline: null, calls: 5 } })
        }
    })
})

describe('PreInvocation turn limit per agy process', () => {
    test('a follow-up gets its own max_turns though agy keeps numbering', async () => {
        const dir = stateDirWith({ max_turns: 3, turn_index: 1 })
        for (const n of [60, 61, 62]) {
            expect(await invoke(dir, n)).toEqual({ exit_code: 0, output: {} })
        }
        expect(await invoke(dir, 63)).toEqual(TERMINATE)
        expect(
            JSON.parse(readFileSync(join(dir, AGY_TURNS_FILE), 'utf8'))
        ).toEqual({ baseline: 60, calls: 4 })
    })

    test('a missing invocationNum is counted, not let through unlimited', async () => {
        const dir = stateDirWith({ max_turns: 2, turn_index: 0 })
        expect(await invoke(dir)).toEqual({ exit_code: 0, output: {} })
        expect(await invoke(dir, 'bad')).toEqual({ exit_code: 0, output: {} })
        expect(await invoke(dir)).toEqual(TERMINATE)
    })
})
