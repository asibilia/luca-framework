import { describe, expect, test } from 'bun:test'

import { createInMemoryTracker } from './in-memory-tracker'

import { specIssue } from '../testing/intake-fixtures'

describe('in-memory tracker: finding an open PR', () => {
    test('finds the open PR from a head branch, and none for another', async () => {
        const tracker = createInMemoryTracker({
            issues: [specIssue({ number: 10 })],
            sub_tickets: {},
        })
        expect(await tracker.findOpenPullRequest({ head: 'luca/a' })).toBeNull()

        const opened = await tracker.openPullRequest({
            head: 'luca/a',
            base: 'main',
            title: 'A',
            body: '',
        })

        expect(await tracker.findOpenPullRequest({ head: 'luca/a' })).toEqual(
            opened
        )
        expect(await tracker.findOpenPullRequest({ head: 'luca/b' })).toBeNull()
    })
})
