import { describe, expect, test } from 'bun:test'

import { parseReply } from './decide-stuck'
import { finalStuckComment } from './final-stuck-text'
import { worktreeLabel } from './stuck-format'
import { stuckComment } from './ticket-stuck-text'

import { EMPTY_FINAL_REVIEW } from '../journal/final-review-state'
import { EMPTY_TICKET_PROGRESS } from '../journal/ticket-progress'
import { redactPrivatePaths } from '../tracker/redact-private-paths'

/**
 * The stuck comments name a worktree without a path from the owner's
 * computer: relative to Luca's runs folder, said once in plain words.
 */

const RUNS = '/Users/me/.local/state/luca/runs'

const DETAIL =
    'error: ENOENT /Users/me/.local/state/luca/runs/r1/tickets/11/src/a.ts\n' +
    'at /home/me/Github/app/src/b.ts:3:7\n' +
    'tmp: /private/var/folders/ab/cd123/T/x.txt'

/** What no comment sent to GitHub may hold. */
const expectNoPrivatePaths = (text: string): void => {
    for (const pattern of [
        /\/Users\//,
        /\/home\//,
        /\/var\/folders/,
        /C:\\Users/i,
        /~\//,
    ]) {
        expect(text).not.toMatch(pattern)
    }
}

const ticketComment = (path: string): string =>
    stuckComment({
        ticket: 11,
        title: 'Add sum',
        progress: EMPTY_TICKET_PROGRESS,
        stuck: { reason: 'gates_failed', detail: DETAIL },
        worktree: { branch: 'luca/spec-10--ticket-11', path, base_sha: 'b1' },
    })

describe("a stuck comment's worktree", () => {
    test("a ticket's worktree is named inside the runs folder, said once, and no path is left once the comment is sent", () => {
        const body = ticketComment(`${RUNS}/r1/tickets/11`)

        expect(body).toContain('Worktree: `runs/r1/tickets/11`')
        expect(body).toContain(
            "in Luca's runs folder on the computer that ran the run"
        )
        // The last error is redacted on its way out, by the tracker.
        expect(body.split('Last error')[0]).not.toContain('/Users/')
        expectNoPrivatePaths(redactPrivatePaths({ text: body }))
        expect(parseReply({ body })).toBeNull()
        expect(parseReply({ body: 'retry #11' })).toEqual({
            word: 'retry',
            ticket: 11,
            amount: null,
        })
    })

    test("the final review's run branch worktree is named the same way", () => {
        const body = finalStuckComment({
            review: {
                ...EMPTY_FINAL_REVIEW,
                stuck: { reason: 'gates_failed', detail: DETAIL },
            },
            run_branch: {
                branch: 'luca/spec-10-run',
                path: `${RUNS}/r1/run-branch`,
                base_sha: 'b1',
            },
        })

        expect(body).toContain('Run branch worktree: `runs/r1/run-branch`')
        expect(body).toContain("in Luca's runs folder")
        // The last error is redacted on its way out, by the tracker.
        expect(body.split('Last error')[0]).not.toContain('/Users/')
        expectNoPrivatePaths(redactPrivatePaths({ text: body }))
    })

    test('a worktree outside a runs folder is named by its last folder only', () => {
        expect(worktreeLabel({ path: '/Users/me/elsewhere/wt-11' })).toBe(
            'wt-11'
        )
        expect(
            worktreeLabel({ path: 'C:\\Users\\me\\runs\\r2\\tickets\\4\\' })
        ).toBe('runs/r2/tickets/4')
        expect(worktreeLabel({ path: '/' })).toBe('the worktree')
    })
})
