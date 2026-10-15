import { describe, expect, test } from 'bun:test'

import type { TestRun } from './gate-schemas'
import {
    fileTestsCommand,
    joinRuns,
    parseJunit,
    withOwnRun,
} from './test-runner'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" assertions="3" failures="1" skipped="1" time="0.5">
  <testsuite name="src/sum.test.ts" file="src/sum.test.ts" tests="3" assertions="3" failures="1" skipped="1" time="0.5">
    <testsuite name="sum" file="src/sum.test.ts" line="3" tests="3" assertions="3" failures="1" skipped="1" time="0.5">
      <testcase name="adds" classname="sum" time="0.012345" file="src/sum.test.ts" line="4" assertions="2" />
      <testcase name="times out" classname="sum" time="2.0004" file="src/sum.test.ts" line="8" assertions="0">
        <failure type="TimeoutError" message="test timed out" />
      </testcase>
      <testcase name="later" classname="sum" time="0" file="src/sum.test.ts" line="12" assertions="1"><skipped /></testcase>
    </testsuite>
  </testsuite>
</testsuites>`

describe('parseJunit: times and expect() counts (#518, #581)', () => {
    test('each case gets its time in whole milliseconds and its expect() count', () => {
        expect(parseJunit({ xml: XML })).toEqual([
            {
                file: 'src/sum.test.ts',
                full_name: 'sum > adds',
                status: 'passed',
                duration_ms: 12,
                assertions: 2,
            },
            {
                file: 'src/sum.test.ts',
                full_name: 'sum > times out',
                status: 'failed',
                duration_ms: 2000,
                assertions: 0,
            },
            {
                file: 'src/sum.test.ts',
                full_name: 'sum > later',
                status: 'skipped',
                duration_ms: 0,
                assertions: 1,
            },
        ])
    })

    test('a report without time or assertions attributes leaves them out', () => {
        const old =
            '<testsuite name="a.test.ts" file="a.test.ts"><testcase name="x" file="a.test.ts" /></testsuite>'
        expect(parseJunit({ xml: old })).toEqual([
            { file: 'a.test.ts', full_name: 'x', status: 'passed' },
        ])
    })
})

const run = (over: Partial<TestRun>): TestRun => ({
    command: 'bun test',
    ok: true,
    exit_code: 0,
    no_test_files: false,
    cases: [],
    files_without_results: [],
    output: '',
    ...over,
})

describe("a ticket's own slow test files (#564)", () => {
    test('run with plain bun test and each file as a quoted ./ path', () => {
        expect(
            fileTestsCommand({
                files: ['src/a b.e2e.test.ts', "src/it's.e2e.test.ts"],
            })
        ).toBe(`bun test './src/a b.e2e.test.ts' './src/it'\\''s.e2e.test.ts'`)
    })

    test('joinRuns keeps every case, and a file without results only if no run gave it any', () => {
        const fast = run({
            cases: [{ file: 'a.test.ts', full_name: 'a', status: 'passed' }],
            files_without_results: ['b.e2e.test.ts', 'c.e2e.test.ts'],
        })
        const own = run({
            command: "bun test './b.e2e.test.ts'",
            ok: false,
            exit_code: 1,
            cases: [
                { file: 'b.e2e.test.ts', full_name: 'b', status: 'failed' },
            ],
            files_without_results: [],
        })
        const joined = joinRuns({
            runs: [fast, own],
            test_files: ['a.test.ts', 'b.e2e.test.ts', 'c.e2e.test.ts'],
        })
        expect(joined.cases).toHaveLength(2)
        expect(joined.ok).toBe(false)
        expect(joined.files_without_results).toEqual(['c.e2e.test.ts'])
        expect(joined.command).toBe("bun test && bun test './b.e2e.test.ts'")
    })

    test('joinRuns of one run is that run, and of none is an empty passing run', () => {
        const only = run({
            command: 'bun test src',
            ok: false,
            exit_code: 1,
            cases: [{ file: 'a.test.ts', full_name: 'a', status: 'failed' }],
            files_without_results: ['b.test.ts'],
            output: 'one run',
        })
        expect(joinRuns({ runs: [only], test_files: ['a.test.ts'] })).toBe(only)

        expect(joinRuns({ runs: [], test_files: ['a.test.ts'] })).toEqual(
            run({
                command: '',
                output: 'No test command with bun results to run.',
            })
        )
    })

    test('withOwnRun joins an own run that gave results, and leaves the fast run as it is when it gave none', () => {
        const fast = run({
            command: "bun test --path-ignore-patterns='**/*.e2e.test.ts'",
            ok: false,
            exit_code: 1,
            files_without_results: ['src/sum.test.ts', 'src/sum.e2e.test.ts'],
            output: 'error: Cannot find module "./sum"\n 0 pass\n 1 fail',
        })
        const test_files = ['src/sum.test.ts', 'src/sum.e2e.test.ts']
        const nothing = run({
            command: "bun test './src/sum.test.ts' './src/sum.e2e.test.ts'",
            ok: false,
            exit_code: 1,
            files_without_results: test_files,
            output: 'error: Cannot find module "./sum"',
        })

        // Every own file still doesn't load, which the fast run said already.
        expect(withOwnRun({ fast, own: nothing, test_files })).toBe(fast)

        const some = run({
            command: "bun test './src/sum.e2e.test.ts'",
            ok: false,
            exit_code: 1,
            cases: [
                {
                    file: 'src/sum.e2e.test.ts',
                    full_name: 's',
                    status: 'failed',
                },
            ],
            files_without_results: [],
        })
        const joined = withOwnRun({ fast, own: some, test_files })
        expect(joined.command).toBe(`${fast.command} && ${some.command}`)
        expect(joined.cases).toHaveLength(1)
        expect(joined.files_without_results).toEqual(['src/sum.test.ts'])
    })
})
