import { describe, expect, test } from 'bun:test'

import { createInMemoryTracker } from './in-memory-tracker'
import { TrackerError } from './tracker'

import type { Story } from '../story/story-schema'
import { story } from '../story/testing/story-fixtures'
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

/** A valid story for pull request `pr_number` of the default practice repo. */
const practiceStory = ({
    pr_number = 12,
    title = 'Retry stuck tickets',
}: {
    pr_number?: number
    title?: string
} = {}): Story => ({
    ...story(),
    repo: 'luca-test/practice',
    pr_number,
    pr_url: `https://github.com/luca-test/practice/pull/${pr_number}`,
    title,
})

const trackerWith = (
    options: { story_home?: 'shared' | 'private'; repo?: string } = {}
) =>
    createInMemoryTracker({
        issues: [specIssue({ number: 10 })],
        sub_tickets: {},
        ...options,
    })

describe('in-memory tracker: stories', () => {
    test('its repo is luca-test/practice unless the repo option says otherwise', () => {
        expect(trackerWith().repo).toBe('luca-test/practice')
        expect(trackerWith({ repo: 'acme/site' }).repo).toBe('acme/site')
    })

    test('a saved story is kept with its home and PR, and a later save for that PR replaces it', async () => {
        const tracker = trackerWith()
        const first = practiceStory()
        await tracker.saveStory({ story: first })
        expect(tracker.savedStories()).toEqual([
            { story: first, home: 'shared', pr_number: 12 },
        ])

        const second = practiceStory({ title: 'A second story' })
        await tracker.saveStory({ story: second })

        expect(tracker.savedStories()).toEqual([
            { story: second, home: 'shared', pr_number: 12 },
        ])
    })

    test('the story_home option picks the home, shared by default', async () => {
        const kept = trackerWith({ story_home: 'private' })
        expect(await kept.storyHome()).toBe('private')
        expect(await kept.saveStory({ story: practiceStory() })).toEqual({
            status: 'saved',
            home: 'private',
            comments: 0,
        })

        const shared = trackerWith()
        expect(await shared.storyHome()).toBe('shared')
        expect(await shared.saveStory({ story: practiceStory() })).toEqual({
            status: 'saved',
            home: 'shared',
            comments: 1,
        })
    })

    test('a waiting head_moved answer is given once, and keeps no story', async () => {
        const tracker = trackerWith()
        tracker.nextStorySave({ status: 'head_moved', pr_head_sha: 'abc123' })

        expect(await tracker.saveStory({ story: practiceStory() })).toEqual({
            status: 'head_moved',
            pr_head_sha: 'abc123',
        })
        expect(tracker.savedStories()).toEqual([])
        expect(
            (await tracker.saveStory({ story: practiceStory() })).status
        ).toBe('saved')
    })

    test('a waiting error is thrown by the next save only', async () => {
        const tracker = trackerWith()
        const refused = new TrackerError('HTTP 403: Resource not accessible')
        tracker.nextStorySave(refused)

        const thrown = await tracker.saveStory({ story: practiceStory() }).then(
            () => null,
            (error: unknown) => error
        )

        expect(thrown).toBe(refused)
        expect(
            (await tracker.saveStory({ story: practiceStory() })).status
        ).toBe('saved')
    })
})
