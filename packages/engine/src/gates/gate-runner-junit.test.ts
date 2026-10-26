import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runGates } from './gate-runner'

import { EngineConfigSchema } from '../config/engine-config'
import {
    ADDING_TESTS_SWIFT,
    CORE_SWIFT_TESTING_XML,
} from '../testing/swift-junit-fixtures'

/**
 * A `junit` test command in the gates (#668): it runs through the junit
 * runner, as written, and its cases feed the `test` check, the speed
 * limit's measured times, and the gates' cases.
 */

let folder = ''

beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'luca-gates-junit-'))
    await Bun.write(join(folder, ADDING), ADDING_TESTS_SWIFT)
})

afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
})

const ADDING = 'Tests/CalcTests/AddingTests.swift'
const JUNIT_PATH = 'out/core-swift-testing.xml'

/** A stand-in for `swift test`: prints a line, copies `xml`, exits `exit`. */
const standIn = async ({ xml, exit }: { xml: string; exit: number }) => {
    await Bun.write(join(folder, 'fixtures/results.xml'), xml)
    return `echo swift-test-ran && cp fixtures/results.xml ${JUNIT_PATH} && exit ${exit}`
}

const gates = ({
    command,
    test_case_timeout_ms,
    measured_files,
}: {
    command: string
    test_case_timeout_ms?: number
    measured_files?: string[]
}) =>
    runGates({
        cwd: folder,
        config: EngineConfigSchema.parse({
            checks: {
                test: [
                    { run: command, results: 'junit', junit_path: JUNIT_PATH },
                ],
            },
            test_case_timeout_ms,
        }),
        install: null,
        test_files: [ADDING],
        report_file: join(folder, 'r.xml'),
        measured_files,
    })

/** One passing Swift Testing case that took 2.3 s. */
const SLOW_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="TestResults" errors="0" tests="1" failures="0" time="2.3">
    <testcase classname="CalcTests.AddingTests" name="addsTwoNumbers()" time="2.3" />
  </testsuite>
</testsuites>
`

describe('a junit test command in the gates (#668)', () => {
    test('a failed Swift case fails the test check with its output, and is among the failed cases', async () => {
        const command = await standIn({ xml: CORE_SWIFT_TESTING_XML, exit: 1 })

        const { ok, checks, cases } = await gates({ command })

        expect(ok).toBe(false)
        const check = checks.find(({ name }) => name === 'test')
        expect(check?.ok).toBe(false)
        expect(check?.output).toContain('swift-test-ran')
        expect(
            cases
                .filter(({ status }) => status === 'failed')
                .map(({ file, full_name }) => ({ file, full_name }))
        ).toEqual([
            { file: ADDING, full_name: 'AddingTests > failsOnPurpose()' },
        ])
    }, 20_000)

    test('a passing Swift case in a changed file over test_case_timeout_ms fails the test check, and the command gets no --timeout', async () => {
        const command = await standIn({ xml: SLOW_XML, exit: 0 })

        const { ok, checks } = await gates({
            command,
            test_case_timeout_ms: 2000,
            measured_files: [ADDING],
        })

        expect(ok).toBe(false)
        const check = checks.find(({ name }) => name === 'test')
        expect(check?.command).toBe(command)
        expect(check?.output).toContain(
            'A fast test may take at most 2000 ms (`test_case_timeout_ms`). Make it faster, or move it to the slow tests.'
        )
        expect(check?.output).toContain(
            `Too slow for a fast test:\n- ${ADDING} > AddingTests > addsTwoNumbers(): 2300 ms`
        )
    }, 20_000)

    test("the gates' cases hold each Swift case with its expect() count", async () => {
        const command = await standIn({ xml: CORE_SWIFT_TESTING_XML, exit: 1 })

        const { cases } = await gates({ command })

        expect(
            cases.map(({ file, full_name, assertions }) => ({
                file,
                full_name,
                assertions,
            }))
        ).toEqual(
            expect.arrayContaining([
                {
                    file: ADDING,
                    full_name: 'AddingTests > checksNothing()',
                    assertions: 0,
                },
                {
                    file: ADDING,
                    full_name: 'AddingTests > addsTwoNumbers()',
                    assertions: 1,
                },
            ])
        )
    }, 20_000)
})
