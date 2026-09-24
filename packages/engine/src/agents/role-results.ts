import { z } from 'zod'

/**
 * The final review's **lenses**, in the order the board shows them. Each is
 * its own role (`<lens>-lens`), so every agent record names its lens and
 * failed tries count per lens.
 */
export const LENS_NAMES = [
    'architecture',
    'simplification',
    'security',
    'integration',
    'rules',
] as const

export const LensNameSchema = z.enum(LENS_NAMES)

export type LensName = z.infer<typeof LensNameSchema>

/** The five lens roles of the final review, one per lens. */
export const LENS_ROLES = [
    'architecture-lens',
    'simplification-lens',
    'security-lens',
    'integration-lens',
    'rules-lens',
] as const

export type LensRole = (typeof LENS_ROLES)[number]

/**
 * The roles an agent can play: the ticket roles while a ticket is built, and
 * one reviewer role per lens in the final review. The final review's fixers
 * are the test-writer and the implementer.
 */
export const AgentRoleSchema = z.enum([
    'test-writer',
    'implementer',
    'ticket-reviewer',
    ...LENS_ROLES,
])

export type AgentRole = z.infer<typeof AgentRoleSchema>

/**
 * A lens's role.
 *
 * @example
 * lensRole({ lens: 'security' }) // 'security-lens'
 */
export const lensRole = ({ lens }: { lens: LensName }): LensRole =>
    `${lens}-lens`

/**
 * The lens a role reviews through, or `null` for a role that is no lens.
 *
 * @example
 * lensOf({ role: 'rules-lens' }) // 'rules'
 * lensOf({ role: 'implementer' }) // null
 */
export const lensOf = ({ role }: { role: AgentRole }): LensName | null =>
    LENS_NAMES.find((lens) => lensRole({ lens }) === role) ?? null

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

/**
 * A review fixer's answer to one finding it was sent: `fixed`, or
 * `wont_fix` with its reason (pushback the next fresh reviewer rules on).
 */
export const FindingResponseSchema = z.object({
    finding_id: z.string().min(1),
    response: z.enum(['fixed', 'wont_fix']),
    reason: z.string().default(''),
})

export type FindingResponse = z.infer<typeof FindingResponseSchema>

/** What a review fixer adds to its result: an answer per finding it got. */
const FIXER_FIELDS = {
    /** Empty unless the agent was sent review findings to fix. */
    finding_responses: z.array(FindingResponseSchema).default([]),
}

const SHARED_FIELDS = {
    summary: z.string().default(''),
    /** Calls the agent made by itself when something was unclear. */
    assumptions: z.array(z.string()).default([]),
    /** Short facts about the repo for later agents in the run. */
    run_notes: z.array(z.string()).default([]),
}

/**
 * The test-writer's result. `nothing_new_to_test` is an honest answer for a
 * ticket that changes no behavior; the engine then makes the ticket stuck,
 * with a hint to label it `refactor`.
 */
export const TestWriterResultSchema = z.object({
    outcome: z.enum(['tests_written', 'nothing_new_to_test']),
    /** For each criterion id (AC1, AC2, ...), the tests that check it. */
    criteria: z.array(CriterionTestsSchema).default([]),
    ...SHARED_FIELDS,
    ...FIXER_FIELDS,
})

export type TestWriterResult = z.infer<typeof TestWriterResultSchema>

/** A test an implementer sends back as wrong, and why. */
export const BadTestSchema = z.object({
    file: z.string(),
    name: z.string(),
    reason: z.string(),
})

export type BadTest = z.infer<typeof BadTestSchema>

/** The implementer's result. `bad_test` sends a wrong test back. */
export const ImplementerResultSchema = z.object({
    outcome: z.enum(['done', 'bad_test']),
    bad_test: BadTestSchema.nullable().default(null),
    ...SHARED_FIELDS,
    ...FIXER_FIELDS,
})

export type ImplementerResult = z.infer<typeof ImplementerResultSchema>

/**
 * How much a finding matters: a blocker or a should-fix goes back for
 * fixing; a nit only goes in the PR description.
 */
export const FindingSeveritySchema = z.enum(['blocker', 'should_fix', 'nit'])

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>

/** One problem a reviewer reports. */
export const FindingSchema = z.object({
    id: z.string().min(1),
    severity: FindingSeveritySchema,
    /** `test` if the fix belongs in a test file, else `code`. */
    kind: z.enum(['code', 'test']),
    file: z.string().nullable().default(null),
    title: z.string(),
    detail: z.string().default(''),
})

export type Finding = z.infer<typeof FindingSchema>

/**
 * A re-reviewer's ruling on a fixer's "won't fix": `accepted` declines the
 * finding (it goes in the PR description), `rejected` keeps it open.
 */
export const FindingRulingSchema = z.object({
    finding_id: z.string().min(1),
    ruling: z.enum(['accepted', 'rejected']),
    reason: z.string().default(''),
})

export type FindingRuling = z.infer<typeof FindingRulingSchema>

/** Whether a finding must be fixed before the ticket joins. */
export const isBlocking = ({ severity }: Pick<Finding, 'severity'>): boolean =>
    severity !== 'nit'

/**
 * The ticket reviewer's result. `verdict` is `changes_requested` exactly
 * when a finding is a blocker or a should-fix; `parseRoleResult` refuses a
 * verdict that disagrees with its findings.
 */
export const TicketReviewResultSchema = z.object({
    verdict: z.enum(['approve', 'changes_requested']),
    findings: z.array(FindingSchema).default([]),
    /** On a re-review: a ruling on each finding a fixer declined. */
    rulings: z.array(FindingRulingSchema).default([]),
    summary: z.string().default(''),
    assumptions: z.array(z.string()).default([]),
})

export type TicketReviewResult = z.infer<typeof TicketReviewResultSchema>

/**
 * A final review lens's result: the same fields as a ticket review's. The
 * verdict must match the findings here too.
 */
export const LensReviewResultSchema = TicketReviewResultSchema

export type LensReviewResult = z.infer<typeof LensReviewResultSchema>

const lensResult = <Role extends LensRole>(role: Role) =>
    z.object({ role: z.literal(role), result: LensReviewResultSchema })

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
    lensResult('architecture-lens'),
    lensResult('simplification-lens'),
    lensResult('security-lens'),
    lensResult('integration-lens'),
    lensResult('rules-lens'),
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
    // Every reviewer (the ticket reviewer and each lens) gives a verdict.
    const { result } = parsed.data
    if ('verdict' in result) {
        const { verdict, findings } = result
        const expected = findings.some(isBlocking)
            ? 'changes_requested'
            : 'approve'
        if (verdict !== expected) {
            return {
                ok: false,
                error: `The ${role}'s verdict "${verdict}" does not match its findings: it must be "${expected}" (changes are requested exactly when a finding is a blocker or a should_fix).`,
            }
        }
    }
    return { ok: true, value: parsed.data }
}
