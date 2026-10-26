import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { hasProblem } from './doctor-checks'

import { createFakeMuninn } from '../testing/fake-muninn'
import {
    CONFIG_PATH,
    fakeGitHub,
    makeRepo,
    printed,
    repo,
    setup,
    useSetupRepo,
} from '../testing/setup-repo'
import { RUN_LABELS } from '../tracker/tracker'

/**
 * junit test commands (#668) in `luca setup` and `luca doctor`, through
 * `testing/setup-repo.ts`: setup lists them as junit-readable, and doctor's
 * repo group gets a `junit` check that reads each command, the root
 * `package.json` script it names, and the shell script that starts, for a
 * `swift test` without `--parallel` or a `junit_path` with half of
 * SwiftPM's pair of files.
 */

useSetupRepo()

const JUNIT = 'packages/ios/.derived/junit'
const CORE_XML = `${JUNIT}/core.xml`
const CORE_SWIFT_TESTING_XML = `${JUNIT}/core-swift-testing.xml`

/** A junit test command, with both of SwiftPM's files unless told. */
const junitCommand = ({
    run = 'bun run ios:test:core',
    junit_path = [CORE_XML, CORE_SWIFT_TESTING_XML],
}: {
    run?: string
    junit_path?: string[]
} = {}) => ({ run, results: 'junit', junit_path })

/** A repo with these test commands, root `package.json` scripts and files. */
const junitRepo = async ({
    test,
    scripts = {},
    files = {},
}: {
    test: unknown[]
    scripts?: Record<string, string>
    files?: Record<string, string>
}) =>
    makeRepo({
        files: {
            'package.json': JSON.stringify({ name: 'movie-rankings', scripts }),
            [CONFIG_PATH]: JSON.stringify({
                checks: { test },
                muninn: { vault: 'tmnb' },
            }),
            ...files,
        },
    })

/**
 * Doctor's repo group, as `luca setup` runs it, with every label, the
 * remote and the vault in place.
 */
const doctorRepoChecks = async () =>
    (
        await setup({
            github: fakeGitHub({ labels: RUN_LABELS }).github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })
    ).doctor

/** Doctor's `junit` check, or throws when the repo group has none. */
const junitCheck = async () => {
    const found = (await doctorRepoChecks()).find(
        ({ name }) => name === 'junit'
    )
    if (found === undefined) throw new Error('No junit check')
    return found
}

const noParallel = (run: string): string =>
    `\`${run}\` runs swift test without --parallel, so XCTest writes no JUnit file and its results can't be read.`

const halfPair = ({ run, missing }: { run: string; missing: string }) =>
    `\`${run}\` runs swift test, but its junit_path doesn't list ${missing}.`

const PARALLEL_FIX = 'Add --parallel to its swift test command.'

const PAIR_FIX =
    'Add it to junit_path in .luca/config.json: swift test writes XCTest results to core.xml and Swift Testing results to core-swift-testing.xml.'

const SWIFT_TEST_PARALLEL = `swift test --parallel --xunit-output ${CORE_XML}`

const SWIFT_TEST_SERIAL = `swift test --xunit-output ${CORE_XML}`

describe('luca setup lists junit test commands (#668)', () => {
    test('a junit command is listed as junit-readable', async () => {
        await junitRepo({
            test: [junitCommand()],
            scripts: { 'ios:test:core': SWIFT_TEST_PARALLEL },
        })

        const end = await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expect(printed(end)).toContain(
            '`bun run ios:test:core` (junit-readable)'
        )
    }, 60_000)

    test('with neither a bun nor a junit command, the to-do names both', async () => {
        await junitRepo({ test: ['bun run test:workers'] })

        const end = await setup({
            github: fakeGitHub().github,
            memory: createFakeMuninn({ vaults: { tmnb: [] } }),
        })

        expect(printed(end)).toContain(
            'No test command gives per-test results, so only refactor tickets can run. Add a `bun test` command, or one with `"results": "junit"`, to `checks.test` in .luca/config.json.'
        )
    }, 60_000)
})

describe("doctor's junit check (#668)", () => {
    test('the repo group has a junit check with a junit command, and none without', async () => {
        await junitRepo({
            test: [junitCommand()],
            scripts: { 'ios:test:core': SWIFT_TEST_PARALLEL },
        })
        expect(await junitCheck()).toMatchObject({ group: 'repo' })

        await Bun.write(
            join(repo, CONFIG_PATH),
            JSON.stringify({
                checks: { test: ['bun test'] },
                muninn: { vault: 'tmnb' },
            })
        )
        const names = (await doctorRepoChecks()).map(({ name }) => name)
        expect(names).toContain('config')
        expect(names).not.toContain('junit')
    }, 60_000)

    test('a package.json script running swift test without --parallel is a warning', async () => {
        await junitRepo({
            test: [junitCommand()],
            scripts: { 'ios:test:core': SWIFT_TEST_SERIAL },
        })

        expect(await junitCheck()).toMatchObject({
            status: 'warning',
            detail: noParallel('bun run ios:test:core'),
            fix: PARALLEL_FIX,
        })
    }, 60_000)

    test('swift test and --parallel are read from the command itself', async () => {
        const run = SWIFT_TEST_PARALLEL
        await junitRepo({
            test: [junitCommand({ run, junit_path: [CORE_XML] })],
        })

        expect(await junitCheck()).toMatchObject({
            status: 'warning',
            detail: halfPair({ run, missing: CORE_SWIFT_TESTING_XML }),
            fix: PAIR_FIX,
        })
    }, 60_000)

    test('swift test and --parallel are read from the shell script a package.json script starts after bash', async () => {
        await junitRepo({
            test: [junitCommand({ junit_path: [CORE_XML] })],
            scripts: {
                'ios:test:core': 'bash packages/ios/scripts/swift-test.sh core',
            },
            files: {
                'packages/ios/scripts/swift-test.sh': `#!/bin/bash\ncd packages/ios\nswift test --parallel --disable-sandbox --xunit-output "../../${JUNIT}/$1.xml"\n`,
            },
        })

        expect(await junitCheck()).toMatchObject({
            status: 'warning',
            detail: halfPair({
                run: 'bun run ios:test:core',
                missing: CORE_SWIFT_TESTING_XML,
            }),
            fix: PAIR_FIX,
        })
    }, 60_000)

    test('a script started directly or after sh is read too, and several warnings make one in command order', async () => {
        await junitRepo({
            test: [
                junitCommand(),
                junitCommand({
                    run: 'bun run ios:test:stores',
                    junit_path: [
                        `${JUNIT}/stores.xml`,
                        `${JUNIT}/stores-swift-testing.xml`,
                    ],
                }),
            ],
            scripts: {
                'ios:test:core': 'packages/ios/scripts/core.sh',
                'ios:test:stores': 'sh packages/ios/scripts/stores.sh',
            },
            files: {
                'packages/ios/scripts/core.sh': `swift test --xunit-output ${CORE_XML}\n`,
                'packages/ios/scripts/stores.sh': `swift test --xunit-output ${JUNIT}/stores.xml\n`,
            },
        })

        expect(await junitCheck()).toMatchObject({
            status: 'warning',
            detail: `${noParallel('bun run ios:test:core')} ${noParallel('bun run ios:test:stores')}`,
            fix: `${PARALLEL_FIX} ${PARALLEL_FIX}`,
        })
    }, 60_000)

    test('a script outside the repo is never read, by a path with ".." or an absolute one', async () => {
        const outside = join(repo, '..', 'swift-test.sh')
        await junitRepo({
            test: [
                junitCommand(),
                junitCommand({ run: 'bun run ios:test:stores' }),
            ],
            scripts: {
                'ios:test:core': 'bash ../swift-test.sh',
                'ios:test:stores': `bash ${outside}`,
            },
        })
        await Bun.write(outside, `${SWIFT_TEST_SERIAL}\n`)

        expect(await junitCheck()).toMatchObject({ status: 'ok' })
    }, 60_000)

    test('a junit_path with only core.xml warns about core-swift-testing.xml', async () => {
        await junitRepo({
            test: [junitCommand({ junit_path: [CORE_XML] })],
            scripts: { 'ios:test:core': SWIFT_TEST_PARALLEL },
        })

        expect(await junitCheck()).toMatchObject({
            status: 'warning',
            detail: halfPair({
                run: 'bun run ios:test:core',
                missing: CORE_SWIFT_TESTING_XML,
            }),
            fix: PAIR_FIX,
        })
    }, 60_000)

    test('a junit_path with only core-swift-testing.xml warns about core.xml', async () => {
        await junitRepo({
            test: [junitCommand({ junit_path: [CORE_SWIFT_TESTING_XML] })],
            scripts: { 'ios:test:core': SWIFT_TEST_PARALLEL },
        })

        expect(await junitCheck()).toMatchObject({
            status: 'warning',
            detail: halfPair({
                run: 'bun run ios:test:core',
                missing: CORE_XML,
            }),
            fix: PAIR_FIX,
        })
    }, 60_000)

    test('--parallel and both files listed is OK', async () => {
        await junitRepo({
            test: [junitCommand()],
            scripts: { 'ios:test:core': SWIFT_TEST_PARALLEL },
        })

        expect(await junitCheck()).toMatchObject({
            status: 'ok',
            detail: 'Each junit test command that runs swift test uses --parallel and lists both of its JUnit files',
        })
    }, 60_000)

    test('a junit warning on its own does not fail doctor', async () => {
        await junitRepo({
            test: [junitCommand()],
            scripts: { 'ios:test:core': SWIFT_TEST_SERIAL },
        })

        const checks = await doctorRepoChecks()

        expect(checks.find(({ name }) => name === 'junit')?.status).toBe(
            'warning'
        )
        expect(hasProblem({ checks })).toBe(false)
    }, 60_000)
})
