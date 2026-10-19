/**
 * The prepare check: the config's prepare command, run before every test run
 * in a checkout, one at a time per the config's `prepare_concurrency`.
 */
import type { GateCheck } from './gate-schemas'
import { PREPARE_SLOTS } from './prepare-slots'
import { msSince, shellCheck } from './shell-check'

import {
    prepareConcurrencyOf,
    prepareTimeoutOf,
    type EngineConfig,
} from '../config/engine-config'

/**
 * Runs the config's prepare command in `cwd`, as the `prepare` check, or
 * `null` when the config has none. The engine runs it before every test run
 * in a checkout, so tests that need build outputs find them up to date.
 * It gets its own time limit (see `prepareTimeoutOf`), since a first build
 * can take far longer than other commands.
 *
 * At most `prepareConcurrencyOf` prepare runs go at once in the engine (see
 * `PREPARE_SLOTS`); the rest wait their turn. The time limit starts when a
 * run starts, so waiting for a turn never counts toward it. The check says
 * how long it waited for its turn, as `wait_ms` (#518).
 *
 * @example
 * const prepare = await prepareCheck({ config, cwd })
 * if (prepare !== null && !prepare.ok) console.log(prepare.output)
 */
export const prepareCheck = async ({
    config,
    cwd,
}: {
    config: EngineConfig
    cwd: string
}): Promise<GateCheck | null> => {
    const { prepare } = config
    if (prepare === undefined) return null
    const asked = performance.now()
    return PREPARE_SLOTS.run({
        limit: prepareConcurrencyOf({ config }),
        work: async () => {
            const wait_ms = msSince(asked)
            const check = await shellCheck({
                name: 'prepare',
                command: prepare,
                cwd,
                timeout_ms: prepareTimeoutOf({ config }),
                timeout_hint:
                    'To give it longer, raise `prepare_timeout_ms` in `.luca/config.json`.',
            })
            return { ...check, wait_ms }
        },
    })
}
