import { z } from 'zod'

import { ENTRY_FIELDS } from './entry-fields'

/**
 * The journal entries of a refactor test update (#686): a refactor ticket's
 * implementer sent a test back as bad, and a fresh test-writer may change
 * only that test file. Not the rejoin's `tests_sent_back`.
 */

/** A test file in the worktree and a hash of its contents. */
export const TestFileHashSchema = z.object({
    path: z.string().min(1),
    hash: z.string().min(1),
})

export type TestFileHash = z.infer<typeof TestFileHashSchema>

/**
 * A refactor ticket's first bad test opened a refactor test update: `file`
 * is the test the implementer named, and `reason` why it is wrong. The
 * implementer's work stays uncommitted in the worktree. `test_files` are
 * the test files (and test helpers) in the worktree then, with their
 * contents' hashes: the "before" the test-writer's changes are judged on.
 */
export const RefactorTestUpdateEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('refactor_test_update'),
    content: z.object({
        file: z.string().min(1),
        reason: z.string(),
        test_files: z.array(TestFileHashSchema),
    }),
})

/**
 * After the refactor test update's test-writer answered, the engine compared
 * the test files with the update's `test_files`: `changed` are those it
 * changed, added, or deleted since, the named file included.
 */
export const RefactorTestUpdateCheckedEntrySchema = z.object({
    ...ENTRY_FIELDS,
    kind: z.literal('refactor_test_update_checked'),
    content: z.object({ changed: z.array(z.string()) }),
})
