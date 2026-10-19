import { describe, expect, test } from 'bun:test'

import { oneSteps } from './decide-stuck-helpers'

import type { JournalEntry } from '../journal/journal-record'
import {
    baselineTests,
    runBranchCreated,
    SESSIONS,
    ticketBuilt,
    ticketStuck,
    ticketWorktreeCreated,
} from '../testing/build-fixtures'

/** Seam 1 for stuck work (#366): a test setup file change. */

describe('a test setup file change', () => {
    /** #11's implementer answers that it needs `test/setup.ts` changed. */
    const needsSetupChange = (): JournalEntry[] => [
        runBranchCreated(),
        ticketWorktreeCreated({ ticket: 11 }),
        baselineTests({ ticket: 11 }),
        ...ticketBuilt({ ticket: 11 }).slice(2, 6),
        {
            kind: 'agent_finished',
            ticket: 11,
            role: 'implementer',
            content: {
                role: 'implementer',
                session_id: SESSIONS.implementer,
                result: {
                    outcome: 'needs_setup_change',
                    setup_change: {
                        file: 'test/setup.ts',
                        reason: 'The fake clock must be installed before each test.',
                    },
                },
            },
        },
    ]

    test('an agent that needs a test setup file changed makes the ticket stuck with a clear message', () => {
        const steps = oneSteps(needsSetupChange())
        expect(steps).toEqual([
            {
                type: 'mark_stuck',
                ticket: 11,
                reason: 'setup_change_needed',
                detail: expect.stringContaining('`test/setup.ts`'),
            },
        ])
        const detail = steps[0]?.type === 'mark_stuck' ? steps[0].detail : ''
        expect(detail).toContain('implementer')
        expect(detail).toContain(
            'The fake clock must be installed before each test.'
        )
    })

    test('the spec issue hears that only its owner may change a test setup file, which file and why, and what to do', () => {
        const [stuck] = oneSteps(needsSetupChange())
        if (stuck?.type !== 'mark_stuck') throw new Error(stuck?.type)

        const steps = oneSteps([
            ...needsSetupChange(),
            ticketStuck({
                ticket: 11,
                reason: stuck.reason,
                detail: stuck.detail,
            }),
        ])

        expect(steps).toMatchObject([{ type: 'report_stuck', ticket: 11 }])
        const body = steps[0]?.type === 'report_stuck' ? steps[0].body : ''
        expect(body).toContain('only you may')
        expect(body).toContain('`test/setup.ts`')
        expect(body).toContain(
            'The fake clock must be installed before each test.'
        )
        expect(body).toContain('Make that change yourself in the worktree')
    })
})
