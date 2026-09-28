import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { manyTicketsTracker, manyTicketTurns } from '../testing/many-tickets'
import {
    createPracticeRepo,
    latestStuck,
    PRACTICE_ENGINE_CONFIG,
} from '../testing/practice-repo'

/**
 * Prepare runs one at a time by default (#492). Builds at the same time only
 * fight over the CPU: HeartGold's four first builds took 19 to 25 minutes
 * each at once, against 8 to 10 alone. Here #11 and #12 build at the same
 * time, and each prepare run logs when it starts and ends.
 */

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-prepare-cap-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

/** Logs each run's start and end, with its checkout, outside the repo. */
const loggingPrepare = (log: string): string =>
    `echo "start $PWD" >> ${log}; sleep 0.3; echo "end $PWD" >> ${log}`

describe('prepare runs one at a time', () => {
    test("with the default cap of 1, two tickets' prepare runs never overlap", async () => {
        const log = join(root, 'prepare.log')
        const practice = await createPracticeRepo({
            root,
            config: { ...PRACTICE_ENGINE_CONFIG, prepare: loggingPrepare(log) },
        })

        const { action, records } = await practice.run({
            turns: manyTicketTurns({ journal_file: practice.journal.file }),
            tracker: manyTicketsTracker(),
        })

        expect(latestStuck(records)).toBeNull()
        expect(action).toMatchObject({ type: 'done', outcome: 'pr_opened' })
        const lines = (await Bun.file(log).text()).trim().split('\n')
        // Every start is followed by its own end before the next start.
        for (const [index, line] of lines.entries()) {
            const [event, where] = line.split(' ')
            expect(event).toBe(index % 2 === 0 ? 'start' : 'end')
            if (event === 'end') {
                expect(lines[index - 1]).toBe(`start ${where}`)
            }
        }
        // Both tickets' worktrees ran it, so they had the chance to overlap.
        const checkouts = new Set(lines.map((line) => line.split(' ')[1]))
        for (const ticket of ['11', '12']) {
            expect(
                [...checkouts].some((path) =>
                    path?.endsWith(join('tickets', ticket))
                )
            ).toBe(true)
        }
    }, 120_000)
})
