/**
 * The config's test commands: every one the engine runs (`testCommands`,
 * `slowTestCommands`) and how it reads their results, and the fast test speed
 * limit (#580) added to a `bun` command (`bunTestCommands`).
 */
import type { EngineConfig, TestResults } from './engine-config-schema'

/**
 * One test command the engine runs, how it reads the results, and the JUnit
 * files a `junit` command writes (#668), relative to the repo root: `[]`
 * for every other kind.
 */
export type TestCommand = {
    run: string
    results: TestResults
    junit_path: string[]
}

/** Whether `run` is a `bun test` command, which gives bun's per-test results. */
export const isBunTestCommand = (run: string): boolean =>
    /^bun\s+test(\s|$)/.test(run.trim())

/**
 * Whether a results kind gives per-test results (#668): `bun` and `junit`
 * do, `pass_fail` gives only pass or fail.
 */
export const givesPerTestResults = (results: TestResults): boolean =>
    results === 'bun' || results === 'junit'

/** A command starting with `bun test` gives bun's per-test results. */
const defaultResults = (run: string): TestResults =>
    isBunTestCommand(run) ? 'bun' : 'pass_fail'

/** Reads a test command setting (`checks.test` or `checks.slow_test`) into commands. */
const commandsOf = (value: EngineConfig['checks']['test']): TestCommand[] => {
    if (value === undefined) return []
    return (typeof value === 'string' ? [value] : value).map((entry) =>
        typeof entry === 'string'
            ? { run: entry, results: defaultResults(entry), junit_path: [] }
            : {
                  run: entry.run,
                  results: entry.results ?? defaultResults(entry.run),
                  junit_path:
                      typeof entry.junit_path === 'string'
                          ? [entry.junit_path]
                          : (entry.junit_path ?? []),
              }
    )
}

/**
 * Every test command in the config, in order, each with its results kind
 * and `junit_path`. A missing `results` is `bun` for a `bun test` command,
 * else `pass_fail`. Empty when there is no test command.
 *
 * @example
 * testCommands({ config: { ...config, checks: { test: ['bun test', 'bun run test:workers'] } } })
 * // [{ run: 'bun test', results: 'bun', junit_path: [] }, { run: 'bun run test:workers', results: 'pass_fail', junit_path: [] }]
 */
export const testCommands = ({
    config,
}: {
    config: EngineConfig
}): TestCommand[] => commandsOf(config.checks.test)

/**
 * Every slow test command (#563), in order, each with its results kind, like
 * `testCommands`. Empty when the config has none.
 *
 * @example
 * slowTestCommands({ config: { ...config, checks: { test: 'bun test src', slow_test: 'bun test .e2e.test' } } })
 * // [{ run: 'bun test .e2e.test', results: 'bun' }]
 */
export const slowTestCommands = ({
    config,
}: {
    config: EngineConfig
}): TestCommand[] => commandsOf(config.checks.slow_test)

/** Whether the config has a slow test command (#563). */
export const hasSlowTests = ({ config }: { config: EngineConfig }): boolean =>
    slowTestCommands({ config }).length > 0

/**
 * Whether the config has a `junit` command (#668), in `checks.test` or
 * `checks.slow_test`: then a bun run counts only files bun can run as
 * without results.
 */
export const hasJunitCommand = ({
    config,
}: {
    config: EngineConfig
}): boolean =>
    [...testCommands({ config }), ...slowTestCommands({ config })].some(
        ({ results }) => results === 'junit'
    )

/** The fast test speed limit (#580), or `null` with none. */
export const caseLimitOf = ({
    config,
}: {
    config: EngineConfig
}): number | null => config.test_case_timeout_ms ?? null

/**
 * A fast `bun` test command with the speed limit (#580): `--timeout=<n>` at
 * its end, or the command as written with no limit.
 *
 * @example
 * fastBunCommand({ run: 'bun test src', config: { ...config, test_case_timeout_ms: 2000 } }) // 'bun test src --timeout=2000'
 */
export const fastBunCommand = ({
    run,
    config,
}: {
    run: string
    config: EngineConfig
}): string => {
    const limit = caseLimitOf({ config })
    return limit === null ? run : `${run} --timeout=${limit}`
}

/**
 * The test commands whose per-test results the engine reads, each with the
 * fast test speed limit (#580) when the config has one. Used by the baseline,
 * the red check and the already-done check; `testCommands` stays as written.
 */
export const bunTestCommands = ({
    config,
}: {
    config: EngineConfig
}): string[] =>
    testCommands({ config })
        .filter(({ results }) => results === 'bun')
        .map(({ run }) => fastBunCommand({ run, config }))
