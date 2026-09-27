import { describe, expect, test } from 'bun:test'

import { decide, type EngineAction } from './decide'

import type { EngineConfig } from '../config/engine-config'
import type { IntakeRead } from '../intake/intake-schemas'
import type { JournalEntry } from '../journal/journal-record'
import { recordsFrom, specIssue, ticketIssue } from '../testing/intake-fixtures'
import type { TrackerIssue } from '../tracker/tracker'

/**
 * Intake and the spec's `release:*` labels (seam 1): one label or none says
 * the bump; more than one is ambiguous, so intake refuses the spec.
 */

const CONFIG: EngineConfig = {
    checks: { test: 'bun test' },
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

const started: JournalEntry = {
    kind: 'run_started',
    ticket: null,
    role: null,
    content: { spec_number: 10, config: CONFIG },
}

const read = (content: IntakeRead): JournalEntry => ({
    kind: 'intake_read',
    ticket: null,
    role: null,
    content,
})

/** The practice spec #10 with these labels. */
const specWithLabels = (labels: string[]): TrackerIssue => ({
    ...specIssue({ number: 10 }),
    labels,
})

/** The action after intake reads spec #10 (with `labels`) and one ticket. */
const decideForSpecLabels = (labels: string[]): EngineAction =>
    decide({
        records: recordsFrom({
            entries: [
                started,
                read({
                    spec: specWithLabels(labels),
                    sub_tickets: [ticketIssue({ number: 11 })],
                    outside_blockers: [],
                }),
            ],
        }),
    })

/** The problems a refusal lists, or none when the action isn't one. */
const problemsOf = (action: EngineAction) =>
    action.type === 'refuse_intake' ? action.problems : []

describe('decision step: intake refuses a spec with more than one release label', () => {
    test('a spec with two release labels is refused on the spec, naming both', () => {
        const action = decideForSpecLabels([
            'ready-for-agent',
            'release:minor',
            'release:major',
        ])

        expect(action).toMatchObject({
            type: 'refuse_intake',
            spec_number: 10,
        })
        const problems = problemsOf(action)
        expect(problems.map(({ ticket }) => ticket)).toEqual([10])
        const missing = problems[0]?.missing ?? []
        expect(missing).toHaveLength(1)
        expect(missing[0]).toContain('release:minor')
        expect(missing[0]).toContain('release:major')
    })

    test('a spec with three release labels is refused, naming each and no other label', () => {
        const action = decideForSpecLabels([
            'ready-for-agent',
            'enhancement',
            'release:patch',
            'release:none',
            'release:major',
        ])

        expect(action).toMatchObject({ type: 'refuse_intake' })
        const problems = problemsOf(action)
        expect(problems.map(({ ticket }) => ticket)).toEqual([10])
        const missing = problems[0]?.missing ?? []
        expect(missing).toHaveLength(1)
        for (const label of [
            'release:patch',
            'release:none',
            'release:major',
        ]) {
            expect(missing[0]).toContain(label)
        }
        expect(missing[0]).not.toContain('enhancement')
    })
})

describe('decision step: intake passes a spec with one release label or none', () => {
    test('one release label passes intake, and a second one on the same spec refuses it', () => {
        for (const label of [
            'release:patch',
            'release:minor',
            'release:major',
            'release:none',
        ]) {
            expect(
                decideForSpecLabels(['ready-for-agent', label])
            ).toMatchObject({ type: 'snapshot_intake' })
        }

        expect(
            decideForSpecLabels([
                'ready-for-agent',
                'release:patch',
                'release:none',
            ])
        ).toMatchObject({ type: 'refuse_intake' })
    })

    test('no release label passes intake, and adding two refuses it', () => {
        expect(decideForSpecLabels(['ready-for-agent'])).toMatchObject({
            type: 'snapshot_intake',
        })

        expect(
            decideForSpecLabels([
                'ready-for-agent',
                'release:minor',
                'release:patch',
            ])
        ).toMatchObject({ type: 'refuse_intake' })
    })
})
