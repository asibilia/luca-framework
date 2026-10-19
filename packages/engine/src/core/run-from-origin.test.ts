import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

/**
 * The README half of #429: a new run starts from `origin/<base>`. It reads
 * one file, so it runs with the fast tests (#568). The runs themselves are
 * in `run-from-origin.e2e.test.ts`.
 */

describe('the engine README', () => {
    test('says runs start from origin/<base>', async () => {
        const readme = await Bun.file(
            join(import.meta.dir, '..', '..', 'docs', 'choices-made.md')
        ).text()

        expect(readme).toContain('origin/<base>')
    })
})
