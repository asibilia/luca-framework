/**
 * The final review's slow tests (#563): the prepare command, then each slow
 * test command, as `slow_test` checks.
 */
import type { GateCheck } from './gate-schemas'
import { prepareCheck } from './prepare-check'
import { testChecks } from './test-checks'

import {
    slowTestCommands,
    testTimeoutOf,
    type EngineConfig,
} from '../config/engine-config'

/**
 * The final review's slow tests (#563), once round 1's lenses are in: the
 * prepare command, if any (a failed one stops there), then each slow
 * test command, in order, as `slow_test` checks with `test_timeout_ms`.
 * `around_prepare`, if given, runs the prepare check, as in `runGates`.
 *
 * @example
 * const { ok, checks } = await runSlowTests({ cwd, config, test_files, report_file })
 */
export const runSlowTests = async ({
    cwd,
    config,
    test_files,
    report_file,
    around_prepare,
}: {
    cwd: string
    config: EngineConfig
    test_files: string[]
    report_file: string
    /** Wraps the prepare run. Left out, it runs as is. */
    around_prepare?: (
        prepare: () => Promise<GateCheck | null>
    ) => Promise<GateCheck | null>
}): Promise<{ ok: boolean; checks: GateCheck[] }> => {
    const prepare = () => prepareCheck({ config, cwd })
    const prepared = await (around_prepare?.(prepare) ?? prepare())
    if (prepared !== null && !prepared.ok) {
        return { ok: false, checks: [prepared] }
    }
    const { checks } = await testChecks({
        commands: slowTestCommands({ config }),
        name: 'slow_test',
        cwd,
        test_files,
        report_file,
        first_index: 0,
        timeout_ms: testTimeoutOf({ config }),
        limit: null,
        test_concurrency: config.test_concurrency,
        exclusive: false,
    })
    const all = prepared === null ? checks : [prepared, ...checks]
    return { ok: all.every(({ ok }) => ok), checks: all }
}
