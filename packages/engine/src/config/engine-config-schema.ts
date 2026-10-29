/**
 * The engine config's shape: the schema of `.luca/config.json` and the
 * pieces it is built from (test results, the `muninn` and `decision_model`
 * blocks, and the `models` block with its floors).
 */
import { isAbsolute, normalize } from 'node:path'

import { z } from 'zod'

import {
    DEFAULT_DECISION_MODEL,
    DecisionModelIdSchema,
} from '../jev/jev-schemas'

/**
 * The engine config file, relative to the root of the repo a run works on.
 * `muninn.vault` sits at the same path old Luca used, because memory tooling
 * outside the engine reads it from there.
 */
export const ENGINE_CONFIG_FILE = '.luca/config.json'

/**
 * How the engine reads a test command's results: `bun` for bun's per-test
 * results (the red check and baseline use these), `junit` for per-test
 * results from the JUnit files the command writes (#668), `pass_fail` for
 * just its exit code.
 */
export const TestResultsSchema = z.enum(['bun', 'junit', 'pass_fail'])

export type TestResults = z.infer<typeof TestResultsSchema>

/**
 * Whether a config path names a file inside the repo (#583): not absolute,
 * not ending in `/` (a folder), and, once cleaned (`normalize`), neither the
 * repo root nor a path that climbs out of it with `..`.
 */
const isFileInsideRepo = (path: string): boolean => {
    const clean = normalize(path)
    return (
        !isAbsolute(path) &&
        !path.endsWith('/') &&
        clean !== '.' &&
        clean !== '..' &&
        !clean.startsWith('../')
    )
}

/** One JUnit file a junit test command writes, relative to the repo root. */
const JunitPathSchema = z.string().min(1).refine(isFileInsideRepo, {
    message:
        'must be a file inside the repo, relative to its root: not an absolute path, not one that leaves the repo with "..", and not ending in "/"',
})

/** The text a slow command's `run_files` must hold, where the files go (#683). */
export const RUN_FILES_PLACEHOLDER = '{files}'

/**
 * One entry of a `checks.test` or `checks.slow_test` list: a command, or a
 * command and its kind. A `junit` command names the JUnit files it writes in
 * `junit_path` (#668), one path or a list; no other kind may have one. A slow
 * entry may also name the test files it owns (`file_patterns`) and how to run
 * some of them (`run_files`, #683); they come together, and a `checks.test`
 * entry may have neither.
 */
const testCommandEntrySchema = ({ slow }: { slow: boolean }) =>
    z.union([
        z.string().min(1),
        z
            .object({
                run: z.string().min(1),
                results: TestResultsSchema.optional(),
                junit_path: z
                    .union([JunitPathSchema, z.array(JunitPathSchema).min(1)])
                    .optional(),
                file_patterns: z.array(z.string().min(1)).min(1).optional(),
                run_files: z.string().min(1).optional(),
            })
            .refine(
                ({ file_patterns, run_files }) =>
                    slow ||
                    (file_patterns === undefined && run_files === undefined),
                {
                    message:
                        'checks.test: file_patterns and run_files belong only on checks.slow_test entries.',
                }
            )
            .refine(
                ({ file_patterns, run_files }) =>
                    !slow ||
                    (file_patterns === undefined) === (run_files === undefined),
                {
                    message:
                        'checks.slow_test: file_patterns and run_files come together; this entry has only one of them.',
                }
            )
            .refine(
                ({ run_files }) =>
                    !slow ||
                    run_files === undefined ||
                    run_files.includes(RUN_FILES_PLACEHOLDER),
                {
                    message: `checks.slow_test: run_files must contain ${RUN_FILES_PLACEHOLDER}.`,
                    path: ['run_files'],
                }
            )
            .refine(
                ({ results, junit_path }) =>
                    results !== 'junit' || junit_path !== undefined,
                {
                    message:
                        'a "junit" test command needs junit_path: the JUnit files it writes, relative to the repo root',
                    path: ['junit_path'],
                }
            )
            .refine(
                ({ results, junit_path }) =>
                    results === 'junit' || junit_path === undefined,
                {
                    message:
                        'junit_path is only for a test command with "results": "junit"',
                    path: ['junit_path'],
                }
            ),
    ])

/**
 * A test command setting: one command, or a list of them (see
 * `testCommands`). Only a slow one's entries may own files (#683).
 */
const testCommandsSchema = ({ slow }: { slow: boolean }) =>
    z.union([z.string().min(1), z.array(testCommandEntrySchema({ slow }))])

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
 * The models an agent may launch on, by short name, strongest first: the
 * one list the launcher, the floors, and the decision model's options read.
 * Claude Code turns each into its newest version; the session's init names
 * the exact one.
 */
export const ModelNameSchema = z.enum(['opus', 'sonnet', 'haiku'])

export type ModelName = z.infer<typeof ModelNameSchema>

/** The model reviewers run on, and every fallback of the model pick (#603). */
export const DEFAULT_MODEL: ModelName = ModelNameSchema.enum.opus

/**
 * How hard an agent thinks before it acts (#659), lowest first: the levels
 * the SDK's `effort` option takes.
 */
export const EffortLevelSchema = z.enum([
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
])

export type EffortLevel = z.infer<typeof EffortLevelSchema>

/** The roles with a model floor (#603); every other role always runs Opus. */
export const ROUTED_ROLES = ['test-writer', 'implementer', 'learner'] as const

/**
 * The cheapest model each routed role may run on; a role left out is
 * `opus`. A floor for any other role, a reviewer or a lens, is refused.
 */
const ModelFloorsSchema = z.strictObject(
    {
        'test-writer': ModelNameSchema.default(DEFAULT_MODEL),
        implementer: ModelNameSchema.default(DEFAULT_MODEL),
        learner: ModelNameSchema.default(DEFAULT_MODEL),
    },
    {
        error: (issue) =>
            issue.code === 'unrecognized_keys'
                ? `${issue.keys.join(', ')} can't have a model floor: reviewers always run Opus. Only ${ROUTED_ROLES.join(', ')} have floors.`
                : undefined,
    }
)

/**
 * The effort each writer runs at on tickets, and the learner's (#660); a
 * role left out is `medium`. An effort for any other role, a reviewer or a
 * lens, is refused: they, and the final review's fixers, always run at
 * xhigh.
 */
const RoleEffortsSchema = z.strictObject(
    {
        'test-writer': EffortLevelSchema.default('medium'),
        implementer: EffortLevelSchema.default('medium'),
        learner: EffortLevelSchema.default('medium'),
    },
    {
        error: (issue) =>
            issue.code === 'unrecognized_keys'
                ? `models.effort can't set ${issue.keys.join(', ')}: reviewers and the final review's fixers always run at xhigh.`
                : undefined,
    }
)

/**
 * The config's `models` block (#603): each routed role's model floor, each
 * writer's effort (#660), and how sure the decision model must be
 * (`confidence_bar`) before its model pick is used, and the share of its
 * unsure but cheaper picks that run anyway in a model trial (`trial_share`,
 * #698).
 */
export const ModelsConfigSchema = z.object({
    floors: ModelFloorsSchema.prefault({}),
    effort: RoleEffortsSchema.prefault({}),
    confidence_bar: z.number().min(0).max(1).default(0.5),
    trial_share: z.number().min(0).max(1).default(0),
})

export type ModelsConfig = z.infer<typeof ModelsConfigSchema>

/**
 * The per-repo engine config: the gate commands, where tests live, the rule
 * files for the rules lens, the project's memory vault, the decision model,
 * the model floors, and the run budget.
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
            test: testCommandsSchema({ slow: false }).optional(),
            /**
             * The slow tests (#563): the tests `test` leaves out, run only at
             * the final review. Same shape as `test`, and an entry may also
             * own some test files and run them in a ticket's gates
             * (`file_patterns`, `run_files`, #683). Left out, nothing
             * changes.
             */
            slow_test: testCommandsSchema({ slow: true }).optional(),
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
     * How many test runs may go at once across the run (#544): the
     * baseline, the red check, the already-done check, and every gate's
     * test and slow test commands. Left out, no cap.
     */
    test_concurrency: z.number().int().positive().optional(),
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
     * The repo's generators (#618): each name a writer may ask the engine to
     * run (`run_generators`), with its command, such as `bun run gen:parser`.
     * The engine runs them in the worktree after the writer's turn, before
     * the checks, and commits their output. Agents never run them. Left out,
     * none.
     */
    generators: z.record(z.string().min(1), z.string().min(1)).optional(),
    /**
     * A markdown file listing each feature and the test files that prove it
     * (#583), relative to the repo root: a path inside the repo, so not an
     * absolute path, not one that climbs out with `..`, and not ending in
     * `/`. A path not ending in `.md` names a folder (#597): every `*.md`
     * page under it together is the map, and `loadEngineConfig` refuses one
     * that is a file. The red check refuses a new test file it doesn't list,
     * and the test-writer may edit it. Left out, no map.
     */
    feature_map: z
        .string()
        .min(1)
        .refine(isFileInsideRepo, {
            message:
                'must be a file inside the repo, or a folder of pages in it, relative to its root: not an absolute path, not one that leaves the repo with "..", and not ending in "/"',
        })
        .optional(),
    test_file_patterns: z.array(z.string()).default(['**/*.test.ts']),
    /**
     * Glob patterns for non-test files the test-writer may also write
     * (#619), such as shared test helpers and fixtures. They aren't tests:
     * the red check and the feature map leave them alone. Left out, none.
     */
    test_helper_patterns: z.array(z.string().min(1)).optional(),
    test_setup_files: z.array(z.string()).default([]),
    rule_files: z.array(z.string()).default([]),
    muninn: MuninnConfigSchema.optional(),
    /** The decision model shadow mode asks; left out, Clef. */
    decision_model: DecisionModelConfigSchema.optional(),
    /**
     * Each routed role's model floor, each writer's effort, and the
     * confidence bar; left out, every role runs Opus, and writers at medium.
     */
    models: ModelsConfigSchema.optional(),
    /**
     * The repo's run budget in tokens; left out, the engine's default
     * (`DEFAULT_RUN_BUDGET_TOKENS`).
     */
    run_budget_tokens: z.number().int().positive().optional(),
})

export type EngineConfig = z.infer<typeof EngineConfigSchema>
