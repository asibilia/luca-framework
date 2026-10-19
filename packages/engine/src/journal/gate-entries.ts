import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

import {
    GateCheckSchema,
    RedCheckResultSchema,
    TestCaseSchema,
    TestRunSchema,
} from '../gates/gate-schemas'

/**
 * The journal entries of the checks on a ticket or the run branch: the red
 * check, the dependency install, and the gates.
 */

export const RedCheckEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('red_check'),
    content: RedCheckResultSchema.extend({ tests: TestRunSchema }),
})

/** Where the gates or the install ran: a ticket's worktree, or the run branch. */
export const GateTargetSchema = z.enum(['ticket', 'run_branch'])

export type GateTarget = z.infer<typeof GateTargetSchema>

/**
 * Where a `gates_run` ran: a ticket's worktree, the run branch, or the
 * final review's slow tests on the run branch (#563), which run once
 * round 1's lenses are in and are not the fix round's gates.
 */
const GatesRunTargetSchema = z.enum([...GateTargetSchema.options, 'final_slow'])

/**
 * The engine installed the dependencies from the lockfile, without changing
 * it, in a new ticket worktree or the run branch's checkout, before any agent
 * or gate ran there. `check` is `null` when there is no `package.json`, so
 * nothing to install. The run branch's record has no ticket.
 */
export const DependenciesInstalledEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('dependencies_installed'),
    content: z.object({
        target: GateTargetSchema,
        check: GateCheckSchema.nullable(),
    }),
})

export const GatesRunEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('gates_run'),
    content: z.object({
        target: GatesRunTargetSchema,
        ok: z.boolean(),
        checks: z.array(GateCheckSchema),
        /**
         * A ticket's gates only: the test cases of the ticket's red test
         * files, with their `expect()` counts (#581). Missing in old journals.
         */
        cases: z.array(TestCaseSchema).optional(),
    }),
})
