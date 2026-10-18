import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

/**
 * The README half of #509: what happens to uncommitted edits at ship time.
 * It reads two docs pages, so it runs with the fast tests (#568). The runs
 * themselves are in `run-ship-uncommitted.e2e.test.ts`.
 */

const NOT_REVIEWED = /uncommitted fixer edits, not reviewed/i

describe('the engine README', () => {
    test('describes what happens to uncommitted edits at ship time', async () => {
        // The commit's message is in the run's steps, the PR's section in
        // the final review's page.
        const pages = ['how-a-run-moves.md', 'final-review.md']
        const text = (
            await Promise.all(
                pages.map((page) =>
                    Bun.file(
                        join(import.meta.dir, '..', '..', 'docs', page)
                    ).text()
                )
            )
        ).join('\n')

        expect(text).toMatch(
            /final review round \S+, shipped with open findings/
        )
        expect(text).toMatch(NOT_REVIEWED)
    })
})
