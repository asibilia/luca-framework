import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

/**
 * The README half of the PR step (#508): the PR body budget, the saved
 * `pull-request.md`, the PR comments, and the stuck reason. It reads one
 * file, so it runs with the fast tests (#568). The runs themselves are in
 * `run-pull-request.e2e.test.ts`.
 */

describe('the engine README', () => {
    test('describes the PR body budget, the saved pull-request.md, the PR comments, and the stuck reason', async () => {
        const text = await Bun.file(
            join(import.meta.dir, '..', '..', 'README.md')
        ).text()

        expect(text).toMatch(/60,000/)
        expect(text).toContain('pull-request.md')
        expect(text).toMatch(/PR comments|comments on the PR/i)
        expect(text).toMatch(/gh pr create/)
    })
})
