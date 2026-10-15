import { describe, expect, test } from 'bun:test'

import { parseJunit } from './test-runner'

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
