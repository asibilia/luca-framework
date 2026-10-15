import { describe, expect, test } from 'bun:test'

import { decide, type EngineAction } from './decide'

import type { EngineConfig } from '../config/engine-config'
import type { JournalEntry } from '../journal/journal-record'
import {
    baselineTests,
    BUILD_CONFIG,
    commitMade,
    intakePassed,
    leftoverScan,
    practiceTicket,
    redCheck,
    runBranchCreated,
    testsWritten,
    ticketWorktreeCreated,
    withInstalls,
} from '../testing/build-fixtures'
import { recordsFrom } from '../testing/intake-fixtures'

/**
 * Seam 1: the feature map (#583) in the launch prompts. The test-writer's
 * system prompt tells it the map is its to edit; its launch prompt says "Edit
 * test files only", so a section after that line names the map as the one
 * exception. The decision step adds it only for a test-writer, and only in a
 * repo with a map.
 */

/** Intake passed on `config`, then `entries`. */
const decideWith = ({
    config,
    entries,
}: {
    config: EngineConfig
    entries: JournalEntry[]
}): EngineAction => {
    const [started, ...rest] = intakePassed({
        tickets: [practiceTicket({ number: 11 })],
    })
    if (started?.kind !== 'run_started') throw new Error('no run_started')
    return decide({
        records: recordsFrom({
            entries: [
                { ...started, content: { ...started.content, config } },
                ...rest,
                ...withInstalls({ entries }),
            ],
        }),
    })
}

const promptOf = (action: EngineAction): string => {
    if (action.type !== 'launch_agent') throw new Error(action.type)
    return action.prompt
}

const UP_TO_TESTS: JournalEntry[] = [
    runBranchCreated(),
    ticketWorktreeCreated({ ticket: 11 }),
    baselineTests({ ticket: 11 }),
]

const UP_TO_IMPLEMENTER: JournalEntry[] = [
    ...UP_TO_TESTS,
    testsWritten({ ticket: 11 }),
    redCheck({ ticket: 11, ok: true }),
    leftoverScan({ ticket: 11, stage: 'red' }),
    commitMade({ ticket: 11, stage: 'red' }),
]

describe('the feature map in the launch prompts (#583)', () => {
    test('the test-writer is told the map is its to edit, by the clean path', () => {
        const action = decideWith({
            config: { ...BUILD_CONFIG, feature_map: './docs/feature-map.md' },
            entries: UP_TO_TESTS,
        })

        expect(action).toMatchObject({ role: 'test-writer' })
        const prompt = promptOf(action)
        expect(prompt).toContain('## The feature map')
        expect(prompt).toContain(
            'Besides test files, you may edit the feature map, `docs/feature-map.md`.'
        )
        expect(prompt).not.toContain('./docs/feature-map.md')
        // After the task's "Edit test files only", so it reads as its exception.
        expect(prompt.indexOf('Edit test files only')).toBeLessThan(
            prompt.indexOf('## The feature map')
        )
    })

    test('the implementer is not told about the map', () => {
        const action = decideWith({
            config: { ...BUILD_CONFIG, feature_map: 'docs/feature-map.md' },
            entries: UP_TO_IMPLEMENTER,
        })

        expect(action).toMatchObject({ role: 'implementer' })
        expect(promptOf(action)).not.toContain('feature map')
    })

    test('without a feature map, the test-writer prompt has no such section', () => {
        const action = decideWith({
            config: BUILD_CONFIG,
            entries: UP_TO_TESTS,
        })

        expect(action).toMatchObject({ role: 'test-writer' })
        expect(promptOf(action)).not.toContain('feature map')
    })
})
