import { describe, expect, test } from 'bun:test'

import { decide } from './decide'
import { decideUsageLine } from './decide-usage-line'

import type { ProviderId } from '../agents/provider'
import { ModelsConfigSchema } from '../config/engine-config'
import {
    UsageLineWindowSchema,
    type JournalEntry,
} from '../journal/journal-record'
import { replayRun } from '../journal/replay'
import {
    BUILD_CONFIG,
    epochSeconds,
    intakePassed,
    practiceTicket,
    runBranchCreated,
    ticketBuilt,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

const TICKET = practiceTicket({ number: 11 })
const LINES = { weekly_line: 80, five_hour_line: 85 }
const WEEKLY_RESET = '2026-01-04T11:00:00.000Z'

const sharedReading = () => ({
    status: 'allowed',
    rateLimitType: 'seven_day',
    isUsingOverage: false,
    overageStatus: 'rejected',
    unifiedWindows: {
        seven_day: { utilization: 0.9, resetsAt: epochSeconds(WEEKLY_RESET) },
    },
    arrived_at: '2026-01-01T00:05:00.000Z',
})

const journalForProvider = ({ provider }: { provider: ProviderId }) => {
    const config = {
        ...BUILD_CONFIG,
        models: ModelsConfigSchema.parse({ provider }),
    }
    const entries: JournalEntry[] = [
        {
            kind: 'run_started',
            ticket: null,
            role: null,
            content: { spec_number: 10, config, base_branch: 'main' },
        },
        ...intakePassed({ tickets: [TICKET] }).slice(1),
        ...withInstalls({
            entries: [
                runBranchCreated(),
                ...ticketBuilt({ ticket: 11 }).slice(0, 2),
            ],
        }),
    ]
    return recordsFrom({ entries })
}

describe('decideUsageLine provider isolation', () => {
    test('ignores shared Claude usage-line readings when run provider is agy, while pausing claude runs', () => {
        const agyRecords = journalForProvider({ provider: 'agy' })
        const claudeRecords = journalForProvider({ provider: 'claude' })

        expect(
            decide({
                records: agyRecords,
                usage_lines: LINES,
                shared_readings: [sharedReading()],
            })
        ).toMatchObject({
            type: 'launch_agent',
            ticket: 11,
            role: 'test-writer',
        })

        expect(
            decide({
                records: claudeRecords,
                usage_lines: LINES,
                shared_readings: [sharedReading()],
            })
        ).toMatchObject({
            type: 'start_usage_line_wait',
            window: 'seven_day',
            percent: 90,
        })
    })

    test('returns null from decideUsageLine for agy even when usage_wait is active in plan state', () => {
        const records = journalForProvider({ provider: 'agy' })
        const state = replayRun({ records })
        const withWait = {
            ...state,
            plan: {
                ...state.plan,
                usage_wait: {
                    window: UsageLineWindowSchema.parse('seven_day'),
                    line: 80,
                    percent: 90,
                    until: '2026-01-04T11:01:00.000Z',
                },
            },
        }

        expect(
            decideUsageLine({
                state: withWait,
                records,
                spec_number: 10,
                next: [{ type: 'launch_agent' }],
                usage_lines: LINES,
                shared_readings: [sharedReading()],
            })
        ).toBeNull()
    })
})
