import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { PRODUCT, SUM } from './decide-stuck-helpers'
import { runEngine } from './execute'

import { createJournal, type Journal } from '../journal/journal'
import type { JournalEntry } from '../journal/journal-record'
import type { EngineClock } from '../limits/limit-wait'
import type { UsageLineDeps } from '../limits/usage-line'
import {
    baselineTests,
    intakePassed,
    runBranchCreated,
    ticketBuilt,
    ticketStuck,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { specIssue, ticketIssue } from '../testing/intake-fixtures'
import { createInMemoryTracker } from '../tracker/in-memory-tracker'
import type { Tracker } from '../tracker/tracker'

/**
 * A step that ends while the engine is deciding (#719). The decision reads
 * the journal, then awaits (the usage line's files, say); a step that ends
 * in that gap frees its ticket, but the decision was made from records
 * where that step had not ended yet. Started anyway, it runs the same step
 * a second time: in run `luca-20261106-135339-79bm`, #243's join ran again
 * at once (seq 765) and its empty cherry-pick wiped the first join's record.
 *
 * Here #11's and #12's stuck reports both start; #12's ends first, and
 * while the engine decides again, #11's ends too. The stale decision still
 * says "report #11", and it must not run again.
 */

const LINES = { weekly_line: 80, five_hour_line: 85 }

let root = ''
let journal: Journal

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-stale-decision-'))
    journal = createJournal({ file: join(root, 'run-1', 'journal.jsonl') })
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** A ticket built up to its implementer, which made it stuck. */
const stuckTicket = (ticket: number): JournalEntry[] => [
    ticketWorktreeCreated({ ticket }),
    baselineTests({ ticket }),
    ...ticketBuilt({ ticket }).slice(2, 6),
    ticketStuck({ ticket, reason: 'setup_change_needed' }),
]

/** The test ends at the first wait for the owner's reply: a sleep throws. */
const REPLY_WAIT = 'the run waits for a reply'

const replyWaitEnds: EngineClock = {
    now: () => Date.parse('2026-01-01T00:00:00.000Z'),
    sleep: async () => {
        throw new Error(REPLY_WAIT)
    },
}

/** Resolves once the journal has a record that `matches`; throws after 5s. */
const journaled = async (
    matches: (kind: string, ticket: number | null) => boolean
): Promise<void> => {
    const until = Date.now() + 5_000
    while (!journal.read().some((r) => matches(r.kind, r.ticket))) {
        if (Date.now() > until) throw new Error('the record never came')
        await Bun.sleep(1)
    }
}

describe('a step that ends while the engine decides', () => {
    test('is not started again from the decision made before it ended', async () => {
        const entries = [
            ...intakePassed({ tickets: [SUM, PRODUCT] }),
            ...withInstalls({
                entries: [
                    runBranchCreated(),
                    ...stuckTicket(11),
                    ...stuckTicket(12),
                ],
            }),
        ]
        for (const entry of entries) journal.append(entry)

        // #11's stuck report is held until the engine is deciding again.
        let releaseSum = () => {}
        const sumHeld = new Promise<void>((resolve) => {
            releaseSum = resolve
        })
        const base = createInMemoryTracker({
            issues: [specIssue({ number: 10 }), ticketIssue({ number: 11 })],
            sub_tickets: { 10: [11, 12] },
        })
        const tracker: Tracker = {
            ...base,
            comment: async (args) => {
                if (args.body.includes('#11')) await sumHeld
                return base.comment(args)
            },
        }

        // The second decision reads the journal, then lets #11's report end
        // before it decides: the gap the real run hit.
        let reads = 0
        const usage: UsageLineDeps = {
            share: async () => undefined,
            read_shared: async () => [],
            read_lines: async () => {
                reads += 1
                if (reads === 2) {
                    releaseSum()
                    await journaled(
                        (kind, ticket) => kind === 'step_ended' && ticket === 11
                    )
                }
                return LINES
            },
        }

        const ended = await runEngine({
            journal,
            tracker,
            usage,
            clock: replyWaitEnds,
        }).catch((error: unknown) => error)

        const reports = journal
            .read()
            .filter(
                ({ kind, ticket }) => kind === 'stuck_reported' && ticket === 11
            )
        expect(ended).toEqual(new Error(REPLY_WAIT))
        expect(reads).toBeGreaterThanOrEqual(2)
        expect(reports).toHaveLength(1)
    })
})
