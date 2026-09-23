import { z } from 'zod'

/** One test case from a test run. */
export const TestCaseSchema = z.object({
    file: z.string(),
    /** Describe names and the test name joined by " > ". */
    full_name: z.string(),
    status: z.enum(['passed', 'failed', 'skipped']),
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
 * install, run first when a package manifest changed.
 */
export const GateNameSchema = z.enum(['install', 'test', 'types', 'lint'])

export type GateName = z.infer<typeof GateNameSchema>

/** One gate's outcome. */
export const GateCheckSchema = z.object({
    name: GateNameSchema,
    command: z.string(),
    ok: z.boolean(),
    exit_code: z.number().int().nullable(),
    output: z.string(),
})

export type GateCheck = z.infer<typeof GateCheckSchema>

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
