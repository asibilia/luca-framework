import { describe, expect, test } from 'bun:test'

import {
    SUM,
    PRODUCT,
    AVERAGE,
    stepsAfter,
    oneSteps,
    gatesFailedForGood,
} from './decide-stuck-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    commentRead,
    replyReceived,
    runBranchCreated,
    stuckReported,
    ticketBuilt,
    ticketPath,
    ticketSkipped,
    worktreesRemoved,
    RUN_BRANCH_PATH,
} from '../testing/build-fixtures'
import { finalReviewClean } from '../testing/final-review-fixtures'

/** Seam 1 for stuck work (#366): the owner's `skip` reply. */

describe('skip', () => {
    const skippedEleven = (): JournalEntry[] => [
        runBranchCreated(),
        ...ticketBuilt({ ticket: 12 }),
        ...gatesFailedForGood(),
        stuckReported({ ticket: 11, comment_id: 111 }),
        commentRead({ comment_id: 120, body: 'skip' }),
        replyReceived({ word: 'skip', ticket: 11, comment_id: 120 }),
    ]
    const threeSteps = (entries: JournalEntry[]) =>
        stepsAfter({ tickets: [SUM, PRODUCT, AVERAGE], entries })

    test('skip leaves the ticket out, with a comment saying why', () => {
        expect(threeSteps(skippedEleven())).toEqual([
            {
                type: 'skip_ticket',
                ticket: 11,
                because: null,
                body: expect.stringContaining('replied `skip`'),
            },
        ])
    })

    test('the tickets that wait on a skipped ticket are skipped too', () => {
        expect(
            threeSteps([...skippedEleven(), ticketSkipped({ ticket: 11 })])
        ).toEqual([
            {
                type: 'skip_ticket',
                ticket: 13,
                because: 11,
                body: expect.stringContaining('it waits on #11'),
            },
        ])
    })

    test('the rest ships: the final review runs, then the PR closes only the built tickets and lists the skipped ones', () => {
        const skippedAll = [
            ...skippedEleven(),
            ticketSkipped({ ticket: 11 }),
            ticketSkipped({ ticket: 13, because: 11 }),
        ]
        expect(threeSteps(skippedAll)[0]?.type).toBe('start_final_review')
        const [step] = threeSteps([...skippedAll, ...finalReviewClean()])
        expect(step?.type).toBe('open_pull_request')
        const body = step?.type === 'open_pull_request' ? step.body : ''
        expect(body).toContain('Closes #12')
        expect(body).not.toContain('Closes #11')
        expect(body).not.toContain('Closes #13')
        expect(body).toContain('## Skipped tickets')
        expect(body).toContain('#11 Add sum')
        expect(body).toContain('#13 Add average: waits on #11')
    })

    test('with every ticket skipped there is no PR', () => {
        const allSkipped = [
            runBranchCreated(),
            ...gatesFailedForGood(),
            stuckReported({ ticket: 11 }),
            replyReceived({ word: 'skip', ticket: 11, comment_id: 120 }),
            ticketSkipped({ ticket: 11 }),
        ]
        expect(oneSteps(allSkipped)).toEqual([
            {
                type: 'remove_worktrees',
                paths: [ticketPath(11), RUN_BRANCH_PATH],
            },
        ])
        expect(
            oneSteps([
                ...allSkipped,
                worktreesRemoved({ paths: [ticketPath(11), RUN_BRANCH_PATH] }),
            ])
        ).toEqual([{ type: 'done', outcome: 'all_skipped' }])
    })
})
