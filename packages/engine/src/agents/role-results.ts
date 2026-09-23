import { z } from 'zod'

/** The roles an agent can play while a ticket is built. */
export const AgentRoleSchema = z.enum([
    'test-writer',
    'implementer',
    'ticket-reviewer',
])

export type AgentRole = z.infer<typeof AgentRoleSchema>

/** One test, named as the test runner prints it. */
export const TestRefSchema = z.object({
    /** Repo-relative path of the test file. */
    file: z.string().min(1),
    /** Describe names and the test name joined by " > ". */
    name: z.string().min(1),
})

export type TestRef = z.infer<typeof TestRefSchema>

/** The tests that check one acceptance criterion. */
export const CriterionTestsSchema = z.object({
    criterion_id: z.string().min(1),
    tests: z.array(TestRefSchema),
})

export type CriterionTests = z.infer<typeof CriterionTestsSchema>

const SHARED_FIELDS = {
    summary: z.string().default(''),
    /** Calls the agent made by itself when something was unclear. */
    assumptions: z.array(z.string()).default([]),
    /** Short facts about the repo for later agents in the run. */
    run_notes: z.array(z.string()).default([]),
}

/**
 * The test-writer's result. `nothing_new_to_test` is an honest answer for a
 * ticket that changes no behavior; the engine then skips the red check.
 */
export const TestWriterResultSchema = z.object({
    outcome: z.enum(['tests_written', 'nothing_new_to_test']),
    /** For each criterion id (AC1, AC2, ...), the tests that check it. */
    criteria: z.array(CriterionTestsSchema).default([]),
    ...SHARED_FIELDS,
})

export type TestWriterResult = z.infer<typeof TestWriterResultSchema>

/** The implementer's result. `bad_test` sends a wrong test back. */
export const ImplementerResultSchema = z.object({
    outcome: z.enum(['done', 'bad_test']),
    bad_test: z
        .object({ file: z.string(), name: z.string(), reason: z.string() })
        .nullable()
        .default(null),
    ...SHARED_FIELDS,
})

export type ImplementerResult = z.infer<typeof ImplementerResultSchema>

/** One problem a reviewer reports. */
export const FindingSchema = z.object({
    id: z.string().min(1),
    severity: z.enum(['blocker', 'should_fix', 'nit']),
    /** `test` if the fix belongs in a test file, else `code`. */
    kind: z.enum(['code', 'test']),
    file: z.string().nullable().default(null),
    title: z.string(),
    detail: z.string().default(''),
})

export type Finding = z.infer<typeof FindingSchema>

/** The ticket reviewer's result. */
export const TicketReviewResultSchema = z.object({
    verdict: z.enum(['approve', 'changes_requested']),
    findings: z.array(FindingSchema).default([]),
    summary: z.string().default(''),
    assumptions: z.array(z.string()).default([]),
})

export type TicketReviewResult = z.infer<typeof TicketReviewResultSchema>

/** A finished agent's result, tagged with its role. */
export const RoleResultSchema = z.discriminatedUnion('role', [
    z.object({
        role: z.literal('test-writer'),
        result: TestWriterResultSchema,
    }),
    z.object({
        role: z.literal('implementer'),
        result: ImplementerResultSchema,
    }),
    z.object({
        role: z.literal('ticket-reviewer'),
        result: TicketReviewResultSchema,
    }),
])

export type RoleResult = z.infer<typeof RoleResultSchema>

/**
 * Checks an agent's structured output against its role's schema. A turn with
 * no output, or output of the wrong shape, is a failed try.
 *
 * @example
 * const checked = parseRoleResult({ role: 'implementer', output })
 * if (!checked.ok) console.error(checked.error)
 */
export const parseRoleResult = ({
    role,
    output,
}: {
    role: AgentRole
    output: unknown
}): { ok: true; value: RoleResult } | { ok: false; error: string } => {
    const parsed = RoleResultSchema.safeParse({ role, result: output })
    if (!parsed.success) {
        return {
            ok: false,
            error: `The ${role}'s result does not fit its schema:\n${z.prettifyError(parsed.error)}`,
        }
    }
    return { ok: true, value: parsed.data }
}
