import { join, normalize } from 'node:path'

import { z } from 'zod'

import {
    DEFAULT_DECISION_MODEL,
    DecisionModelIdSchema,
    type DecisionModelId,
} from '../jev/jev-schemas'
import { DEFAULT_COMMAND_TIMEOUT_MS } from '../shell/run-command'

/**
 * The engine config file, relative to the root of the repo a run works on.
 * `muninn.vault` sits at the same path old Luca used, because memory tooling
 * outside the engine reads it from there.
 */
export const ENGINE_CONFIG_FILE = '.luca/config.json'

/**
 * How the engine reads a test command's results: `bun` for bun's per-test
 * results (the red check and baseline use these), `pass_fail` for just its
 * exit code.
 */
export const TestResultsSchema = z.enum(['bun', 'pass_fail'])

export type TestResults = z.infer<typeof TestResultsSchema>

/** One entry of a `checks.test` list: a command, or a command and its kind. */
const TestCommandEntrySchema = z.union([
    z.string().min(1),
    z.object({
        run: z.string().min(1),
        results: TestResultsSchema.optional(),
    }),
])

/** A test command setting: one command, or a list of them (see `testCommands`). */
const TestCommandsSchema = z.union([
    z.string().min(1),
    z.array(TestCommandEntrySchema),
])

/** The config's `muninn` block. */
export const MuninnConfigSchema = z.object({
    /** The project's memory vault. */
    vault: z.string().min(1),
})

/**
 * The config's `decision_model` block (#534): the Clef model shadow mode
 * asks, `@cf/cloudflare/clef` (the accurate one, the default) or
 * `@cf/cloudflare/clef-flash` (the fast one).
 */
export const DecisionModelConfigSchema = z.object({
    model: DecisionModelIdSchema.default(DEFAULT_DECISION_MODEL),
})

/**
 * The per-repo engine config: the gate commands, where tests live, the rule
 * files for the rules lens, the project's memory vault, the decision model,
 * and the run budget.
 *
 * Unknown keys, such as old Luca's, are dropped when the file is read.
 *
 * The test command is optional here on purpose. A config without it still
 * loads, and intake refuses the run with a clear message instead.
 * `checks.test` is one command or a list of them (see `testCommands`); it is
 * kept as written. `checks.slow_test` has the same shape (see
 * `slowTestCommands`, #563).
 */
export const EngineConfigSchema = z.object({
    checks: z
        .object({
            test: TestCommandsSchema.optional(),
            /**
             * The slow tests (#563): the tests `test` leaves out, run only at
             * the final review. Same shape as `test`. Left out, nothing
             * changes.
             */
            slow_test: TestCommandsSchema.optional(),
            types: z.string().min(1).optional(),
            lint: z.string().min(1).optional(),
        })
        .default({}),
    /**
     * A command the engine runs in a checkout before every test run there
     * (baseline, red check, gates), for repos whose tests need build outputs
     * that are gitignored, such as `bun run build:rom`. Agents never run it.
     */
    prepare: z.string().min(1).optional(),
    /**
     * How long the prepare command may run, in milliseconds; left out, the
     * engine's default (`DEFAULT_PREPARE_TIMEOUT_MS`, 30 minutes).
     */
    prepare_timeout_ms: z.number().int().positive().optional(),
    /**
     * How many prepare runs may go at once across the run; left out, the
     * engine's default (`DEFAULT_PREPARE_CONCURRENCY`, 1).
     */
    prepare_concurrency: z.number().int().positive().optional(),
    /**
     * How long each test command may run, in milliseconds; left out, the
     * engine's default (`DEFAULT_COMMAND_TIMEOUT_MS`, 5 minutes).
     */
    test_timeout_ms: z.number().int().positive().optional(),
    /**
     * How long one fast test may take, in milliseconds (#580): passed to every
     * `bun` command of `checks.test` as `--timeout`, and checked on a ticket's
     * own test files by their measured time. Left out, no limit.
     */
    test_case_timeout_ms: z.number().int().positive().optional(),
    /**
     * Glob patterns for more new markdown the leftover scan lets through,
     * beyond doc folders, READMEs, and files the repo names (#520), such as
     * `design/*.md`; left out, none.
     */
    leftover_allow: z.array(z.string().min(1)).optional(),
    /**
     * A markdown file listing each feature and the test files that prove it
     * (#583), relative to the repo root. The red check refuses a new test file
     * it doesn't list, and the test-writer may edit it. Left out, no map.
     */
    feature_map: z.string().min(1).optional(),
    test_file_patterns: z.array(z.string()).default(['**/*.test.ts']),
    test_setup_files: z.array(z.string()).default([]),
    rule_files: z.array(z.string()).default([]),
    muninn: MuninnConfigSchema.optional(),
    /** The decision model shadow mode asks; left out, Clef. */
    decision_model: DecisionModelConfigSchema.optional(),
    /**
     * The repo's run budget in tokens; left out, the engine's default
     * (`DEFAULT_RUN_BUDGET_TOKENS`).
     */
    run_budget_tokens: z.number().int().positive().optional(),
})

export type EngineConfig = z.infer<typeof EngineConfigSchema>

/**
 * How long the prepare command may run when the config doesn't say: 30
 * minutes. A first build in a fresh worktree can take many minutes
 * (HeartGold's takes about 8), far past the 5 minutes other commands get.
 */
export const DEFAULT_PREPARE_TIMEOUT_MS = 30 * 60 * 1000

/**
 * The prepare command's time limit: the config's `prepare_timeout_ms`, else
 * the default.
 *
 * @example
 * prepareTimeoutOf({ config: { ...config, prepare_timeout_ms: 3_600_000 } }) // 3_600_000
 */
export const prepareTimeoutOf = ({
    config,
}: {
    config: EngineConfig
}): number => config.prepare_timeout_ms ?? DEFAULT_PREPARE_TIMEOUT_MS

/**
 * Each test command's time limit (#542): the config's `test_timeout_ms`,
 * else the engine's default for any command. It holds for every run of a
 * test command (baseline, red check, gates); types and lint keep the default.
 *
 * @example
 * testTimeoutOf({ config: { ...config, test_timeout_ms: 900_000 } }) // 900_000
 */
export const testTimeoutOf = ({ config }: { config: EngineConfig }): number =>
    config.test_timeout_ms ?? DEFAULT_COMMAND_TIMEOUT_MS

/**
 * How many prepare runs may go at once when the config doesn't say: 1. A
 * build is often heavy on the CPU, so builds at the same time only slow each
 * other down (HeartGold's four first builds took 19 to 25 minutes each at
 * once, against 8 to 10 alone).
 */
export const DEFAULT_PREPARE_CONCURRENCY = 1

/**
 * How many prepare runs may go at once: the config's `prepare_concurrency`,
 * else the default.
 *
 * @example
 * prepareConcurrencyOf({ config: { ...config, prepare_concurrency: 2 } }) // 2
 */
export const prepareConcurrencyOf = ({
    config,
}: {
    config: EngineConfig
}): number => config.prepare_concurrency ?? DEFAULT_PREPARE_CONCURRENCY

/**
 * The decision model a run asks: the config's `decision_model.model`, else
 * Clef (`DEFAULT_DECISION_MODEL`).
 *
 * @example
 * decisionModelOf({ config: { ...config, decision_model: { model: '@cf/cloudflare/clef-flash' } } })
 * // '@cf/cloudflare/clef-flash'
 */
export const decisionModelOf = ({
    config,
}: {
    config: EngineConfig
}): DecisionModelId =>
    config.decision_model?.model ?? DecisionModelConfigSchema.parse({}).model

/** One test command the engine runs, and how it reads the results. */
export type TestCommand = { run: string; results: TestResults }

/** Whether `run` is a `bun test` command, which gives bun's per-test results. */
export const isBunTestCommand = (run: string): boolean =>
    /^bun\s+test(\s|$)/.test(run.trim())

/** A command starting with `bun test` gives bun's per-test results. */
const defaultResults = (run: string): TestResults =>
    isBunTestCommand(run) ? 'bun' : 'pass_fail'

/** Reads a test command setting (`checks.test` or `checks.slow_test`) into commands. */
const commandsOf = (value: EngineConfig['checks']['test']): TestCommand[] => {
    if (value === undefined) return []
    return (typeof value === 'string' ? [value] : value).map((entry) =>
        typeof entry === 'string'
            ? { run: entry, results: defaultResults(entry) }
            : {
                  run: entry.run,
                  results: entry.results ?? defaultResults(entry.run),
              }
    )
}

/**
 * Every test command in the config, in order, each with its results kind.
 * A missing `results` is `bun` for a `bun test` command, else `pass_fail`.
 * Empty when there is no test command.
 *
 * @example
 * testCommands({ config: { ...config, checks: { test: ['bun test', 'bun run test:workers'] } } })
 * // [{ run: 'bun test', results: 'bun' }, { run: 'bun run test:workers', results: 'pass_fail' }]
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

/** The fast test speed limit (#580), or `null` with none. */
export const caseLimitOf = ({
    config,
}: {
    config: EngineConfig
}): number | null => config.test_case_timeout_ms ?? null

/**
 * The feature map's path (#583), in the form a worktree-relative path takes
 * everywhere else (`normalize`, no leading `./`), or `null` with no map.
 * `./docs/feature-map.md` and `docs//feature-map.md` are both
 * `docs/feature-map.md`. The role rules, the permission rules, the prompts,
 * and the red check all read the map's path here, so they agree on it
 * whatever way the config spells it.
 *
 * @example
 * featureMapPath({ config: { ...config, feature_map: './docs/feature-map.md' } }) // 'docs/feature-map.md'
 */
export const featureMapPath = ({
    config,
}: {
    config: EngineConfig
}): string | null =>
    config.feature_map === undefined
        ? null
        : normalize(config.feature_map).replace(/^\.\//, '')

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

export type LoadEngineConfigResult =
    | { ok: true; config: EngineConfig }
    | { ok: false; error: string }

const parseJson = ({
    text,
}: {
    text: string
}): { ok: true; value: unknown } | { ok: false; error: string } => {
    try {
        return { ok: true, value: JSON.parse(text) }
    } catch (error) {
        return { ok: false, error: String(error) }
    }
}

/**
 * Reads and checks the engine config at `<repo_root>/.luca/config.json`.
 *
 * Never throws: a missing file, bad JSON, or a config of the wrong shape comes
 * back as `{ ok: false, error }` with a message a person can act on.
 *
 * @example
 * const result = await loadEngineConfig({ repo_root: process.cwd() })
 * if (result.ok) console.log(result.config.checks.test)
 */
export const loadEngineConfig = async ({
    repo_root,
}: {
    repo_root: string
}): Promise<LoadEngineConfigResult> => {
    const path = join(repo_root, ENGINE_CONFIG_FILE)
    const file = Bun.file(path)
    if (!(await file.exists())) {
        return { ok: false, error: `No engine config found at ${path}` }
    }
    const json = parseJson({ text: await file.text() })
    if (!json.ok) {
        return {
            ok: false,
            error: `${path} is not valid JSON: ${json.error}`,
        }
    }
    const parsed = EngineConfigSchema.safeParse(json.value)
    if (!parsed.success) {
        return {
            ok: false,
            error: `${path} is not a valid engine config:\n${z.prettifyError(parsed.error)}`,
        }
    }
    return { ok: true, config: parsed.data }
}
