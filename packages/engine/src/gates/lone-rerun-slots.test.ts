import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { runGates } from './gate-runner'
import { runBunTests } from './test-runner'

import { EngineConfigSchema } from '../config/engine-config'

/**
 * A lone rerun (#544) holds every test slot while it runs: with
 * `exclusive: true`, the gates or the red check's test run wait until no
 * other test run is going, and no other starts until they end. It holds
 * whether `test_concurrency` is set or not.
 */

let folder = ''

beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'luca-lone-rerun-'))
})

afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
})

/** A command that logs its name at its start and end, 0.2 seconds apart. */
const logged = (name: string): string => {
    const log = join(folder, 'log')
    return `echo "start ${name}" >> '${log}'; sleep 0.2; echo "end ${name}" >> '${log}'`
}

const logLines = async (): Promise<string[]> =>
    (await Bun.file(join(folder, 'log')).text()).trim().split('\n')

const gates = ({ name, exclusive }: { name: string; exclusive?: boolean }) =>
    runGates({
        cwd: folder,
        config: EngineConfigSchema.parse({
            checks: { test: [{ run: logged(name), results: 'pass_fail' }] },
        }),
        test_files: [],
        report_file: join(folder, `gates-${name}.xml`),
        install: null,
        ...(exclusive === undefined ? {} : { exclusive }),
    })

const bunRun = ({ name, exclusive }: { name: string; exclusive?: boolean }) =>
    runBunTests({
        cwd: folder,
        commands: [`${logged(name)}; true`],
        test_files: [],
        report_file: join(folder, `${name}.xml`),
        timeout_ms: 10_000,
        ...(exclusive === undefined ? {} : { exclusive }),
    })

const ALONE = ['start a', 'end a', 'start x', 'end x', 'start b', 'end b']

describe('a lone rerun holds every test slot (#544)', () => {
    test('exclusive gates wait for the test run going, and the next one waits for them', async () => {
        const results = await Promise.all([
            bunRun({ name: 'a' }),
            gates({ name: 'x', exclusive: true }),
            gates({ name: 'b' }),
        ])

        expect(results.map(({ ok }) => ok)).toEqual([true, true, true])
        expect(await logLines()).toEqual(ALONE)
    })

    test('an exclusive red check run waits for the test run going, and the next one waits for it', async () => {
        const results = await Promise.all([
            bunRun({ name: 'a' }),
            bunRun({ name: 'x', exclusive: true }),
            gates({ name: 'b' }),
        ])

        expect(results.map(({ ok }) => ok)).toEqual([true, true, true])
        expect(await logLines()).toEqual(ALONE)
    })
})
