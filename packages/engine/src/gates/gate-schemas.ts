import { z } from 'zod'

/** One test case from a test run. */
export const TestCaseSchema = z.object({
    file: z.string(),
    /** Describe names and the test name joined by " > ". */
    full_name: z.string(),
    status: z.enum(['passed', 'failed', 'skipped']),
    /** How long it ran, from bun's JUnit `time` (#518). Missing in old journals. */
    duration_ms: z.number().int().nonnegative().optional(),
    /** How many `expect()` calls it made, from bun's JUnit `assertions` (#581). */
    assertions: z.number().int().nonnegative().optional(),
})

export type TestCase = z.infer<typeof TestCaseSchema>

/** One run of the engine config's test command, with each case's outcome. */
export const TestRunSchema = z.object({
    command: z.string(),
    ok: z.boolean(),
    exit_code: z.number().int().nullable(),
    /** The repo has no test files. The baseline counts that as a pass. */
    no_test_files: z.boolean(),
    cases: z.array(TestCaseSchema),
    /** Test files that produced no results, such as a file that fails to load. */
    files_without_results: z.array(z.string()),
    /** The command's output, clipped. */
    output: z.string(),
})

export type TestRun = z.infer<typeof TestRunSchema>

/**
 * The gates the engine config can name, plus `install`: the engine's own
 * install, run first when a package manifest changed, and `prepare`: the
 * config's prepare command, run before the tests.
 */
export const GateNameSchema = z.enum([
    'install',
    'prepare',
    'test',
    'types',
    'lint',
])

export type GateName = z.infer<typeof GateNameSchema>

/** One gate's outcome. */
export const GateCheckSchema = z.object({
    name: GateNameSchema,
    command: z.string(),
    ok: z.boolean(),
    exit_code: z.number().int().nullable(),
    output: z.string(),
    /** How long the command ran (#518). Missing in old journals. */
    duration_ms: z.number().int().nonnegative().optional(),
    /** `prepare` only: how long it waited for a prepare slot (#518). */
    wait_ms: z.number().int().nonnegative().optional(),
})

export type GateCheck = z.infer<typeof GateCheckSchema>

/**
 * How a failed check ended, for a message: `exit 2`, say, or `timed out`.
 * The engine gives a check no exit code only when it stopped it for running
 * too long.
 *
 * @example
 * endedText({ exit_code: null }) // 'timed out'
 */
export const endedText = ({
    exit_code,
}: {
    exit_code: number | null
}): string => (exit_code === null ? 'timed out' : `exit ${exit_code}`)

/** The red check's verdict: `ok` only with no problems. */
export const RedCheckResultSchema = z.object({
    ok: z.boolean(),
    problems: z.array(z.string()),
    notes: z.array(z.string()),
})

export type RedCheckResult = z.infer<typeof RedCheckResultSchema>

/** A file the leftover scan will not let the engine commit. */
export const LeftoverHitSchema = z.object({
    path: z.string(),
    reason: z.string(),
})

export type LeftoverHit = z.infer<typeof LeftoverHitSchema>

/**
 * Why the leftover scan let a new markdown file through (#520): it sits in a
 * doc place (a `docs` or `adr` folder, or a `README.md`), a tracked or newly
 * added non-test file names it, or a `leftover_allow` pattern matches it.
 */
export const LeftoverPassReasonSchema = z.enum([
    'doc_place',
    'named_by_repo',
    'config_pattern',
])

export type LeftoverPassReason = z.infer<typeof LeftoverPassReasonSchema>

/**
 * A new markdown file the leftover scan let through, and why, as the journal
 * keeps it. The reason is a string there, so a later reason still reads.
 */
export const LeftoverPassSchema = z.object({
    path: z.string(),
    reason: z.string(),
})

/** A new markdown file the leftover scan let through, as the scan returns it. */
export const LeftoverPassResultSchema = LeftoverPassSchema.extend({
    reason: LeftoverPassReasonSchema,
})

export type LeftoverPass = z.infer<typeof LeftoverPassResultSchema>
