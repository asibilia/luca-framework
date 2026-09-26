import { join } from 'node:path'

import { z } from 'zod'

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

/** The config's `muninn` block. */
export const MuninnConfigSchema = z.object({
    /** The project's memory vault. */
    vault: z.string().min(1),
})

/**
 * The per-repo engine config: the gate commands, where tests live, the rule
 * files for the rules lens, the project's memory vault, and the run budget.
 *
 * Unknown keys, such as old Luca's, are dropped when the file is read.
 *
 * The test command is optional here on purpose. A config without it still
 * loads, and intake refuses the run with a clear message instead.
 * `checks.test` is one command or a list of them (see `testCommands`); it is
 * kept as written.
 */
export const EngineConfigSchema = z.object({
    checks: z
        .object({
            test: z
                .union([z.string().min(1), z.array(TestCommandEntrySchema)])
                .optional(),
            types: z.string().min(1).optional(),
            lint: z.string().min(1).optional(),
        })
        .default({}),
    test_file_patterns: z.array(z.string()).default(['**/*.test.ts']),
    test_setup_files: z.array(z.string()).default([]),
    rule_files: z.array(z.string()).default([]),
    muninn: MuninnConfigSchema.optional(),
    /**
     * The repo's run budget in tokens; left out, the engine's default
     * (`DEFAULT_RUN_BUDGET_TOKENS`).
     */
    run_budget_tokens: z.number().int().positive().optional(),
})

export type EngineConfig = z.infer<typeof EngineConfigSchema>

/** One test command the engine runs, and how it reads the results. */
export type TestCommand = { run: string; results: TestResults }

/** Whether `run` is a `bun test` command, which gives bun's per-test results. */
export const isBunTestCommand = (run: string): boolean =>
    /^bun\s+test(\s|$)/.test(run.trim())

/** A command starting with `bun test` gives bun's per-test results. */
const defaultResults = (run: string): TestResults =>
    isBunTestCommand(run) ? 'bun' : 'pass_fail'

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
}): TestCommand[] => {
    const { test } = config.checks
    if (test === undefined) return []
    return (typeof test === 'string' ? [test] : test).map((entry) =>
        typeof entry === 'string'
            ? { run: entry, results: defaultResults(entry) }
            : {
                  run: entry.run,
                  results: entry.results ?? defaultResults(entry.run),
              }
    )
}

/** The test commands whose per-test results the engine reads. */
export const bunTestCommands = ({
    config,
}: {
    config: EngineConfig
}): string[] =>
    testCommands({ config })
        .filter(({ results }) => results === 'bun')
        .map(({ run }) => run)

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
