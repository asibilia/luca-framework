import { describe, expect, test } from 'bun:test'

import {
    configChanges,
    FROZEN_FIELDS,
    RELOADED_FIELDS,
    withConfigChanges,
} from './config-reload'
import { EngineConfigSchema, type EngineConfig } from './engine-config'

/**
 * A resume re-reads the repo's config (#516): only the build fields
 * (`prepare`, `prepare_timeout_ms`, `prepare_concurrency`), the test time
 * limit (`test_timeout_ms`, #542) and the fast test speed limit
 * (`test_case_timeout_ms`, #580) may change in a run; every other field
 * stays as the run started with it.
 */

const STARTED: EngineConfig = {
    checks: { test: 'bun test', lint: 'bun run lint' },
    prepare: 'make rom',
    test_file_patterns: ['**/*.test.ts'],
    test_setup_files: [],
    rule_files: [],
}

describe('the fields a resume reloads', () => {
    test('every field of the config is either reloaded or frozen, never both', () => {
        const all: string[] = Object.keys(EngineConfigSchema.shape).toSorted()
        const named: string[] = [...RELOADED_FIELDS, ...FROZEN_FIELDS]

        // Same length and same names: each field is named once.
        expect(named.toSorted()).toEqual(all)
    })

    test('checks are frozen', () => {
        expect(FROZEN_FIELDS).toContain('checks')
    })

    test('leftover_allow is reloaded, not frozen (#520)', () => {
        expect(RELOADED_FIELDS).toContain('leftover_allow')
        expect(FROZEN_FIELDS).not.toContain('leftover_allow')
    })
})

describe('configChanges and withConfigChanges for leftover_allow (#520)', () => {
    test('a changed leftover_allow is one change, old to new, and the same patterns in a new list are none', () => {
        const current = { ...STARTED, leftover_allow: ['handbook/**/*.md'] }

        expect(
            configChanges({
                current,
                next: {
                    ...STARTED,
                    leftover_allow: ['handbook/**/*.md', 'design/*.md'],
                },
            })
        ).toEqual([
            {
                field: 'leftover_allow',
                from: ['handbook/**/*.md'],
                to: ['handbook/**/*.md', 'design/*.md'],
            },
        ])
        expect(
            configChanges({
                current,
                next: { ...STARTED, leftover_allow: ['handbook/**/*.md'] },
            })
        ).toEqual([])
    })

    test('a new leftover_allow is set on the config, leaving the rest', () => {
        const [change] = configChanges({
            current: STARTED,
            next: { ...STARTED, leftover_allow: ['design/*.md'] },
        })
        if (change === undefined) throw new Error('no change')

        expect(
            withConfigChanges({ config: STARTED, changes: [change] })
        ).toEqual({ ...STARTED, leftover_allow: ['design/*.md'] })
    })
})

describe('configChanges', () => {
    test('the same build fields are no change', () => {
        expect(
            configChanges({ current: STARTED, next: { ...STARTED } })
        ).toEqual([])
    })

    test('a changed prepare is one change, old to new', () => {
        expect(
            configChanges({
                current: STARTED,
                next: { ...STARTED, prepare: 'make rom-cached' },
            })
        ).toEqual([
            { field: 'prepare', from: 'make rom', to: 'make rom-cached' },
        ])
    })

    test('a field added or removed is a change from or to null', () => {
        const { prepare: _, ...noPrepare } = STARTED
        expect(
            configChanges({
                current: STARTED,
                next: { ...noPrepare, prepare_timeout_ms: 60_000 },
            })
        ).toEqual([
            { field: 'prepare', from: 'make rom', to: null },
            { field: 'prepare_timeout_ms', from: null, to: 60_000 },
        ])
    })

    test('a changed test time limit is a change (#542)', () => {
        expect(
            configChanges({
                current: { ...STARTED, test_timeout_ms: 300_000 },
                next: { ...STARTED, test_timeout_ms: 900_000 },
            })
        ).toEqual([{ field: 'test_timeout_ms', from: 300_000, to: 900_000 }])
        expect(
            configChanges({
                current: STARTED,
                next: { ...STARTED, test_timeout_ms: 900_000 },
            })
        ).toEqual([{ field: 'test_timeout_ms', from: null, to: 900_000 }])
    })

    test('a changed fast test speed limit is a change (#580)', () => {
        expect(
            configChanges({
                current: { ...STARTED, test_case_timeout_ms: 2000 },
                next: { ...STARTED, test_case_timeout_ms: 5000 },
            })
        ).toEqual([{ field: 'test_case_timeout_ms', from: 2000, to: 5000 }])
        expect(
            configChanges({
                current: STARTED,
                next: { ...STARTED, test_case_timeout_ms: 2000 },
            })
        ).toEqual([{ field: 'test_case_timeout_ms', from: null, to: 2000 }])
    })

    test('changes to frozen fields are not changes', () => {
        expect(
            configChanges({
                current: STARTED,
                next: {
                    ...STARTED,
                    checks: { test: 'bun test --bail' },
                    test_file_patterns: ['src/**/*.test.ts'],
                    rule_files: ['AGENTS.md'],
                    run_budget_tokens: 5,
                    muninn: { vault: 'other' },
                },
            })
        ).toEqual([])
    })
})

describe('configChanges: the slow command (#563)', () => {
    test('a resume keeps the slow command the run started with (#563)', () => {
        const current = EngineConfigSchema.parse({
            checks: { test: 'bun test', slow_test: 'bun test .e2e.test' },
        })
        const next = EngineConfigSchema.parse({
            checks: { test: 'bun test', slow_test: 'bun test e2e/' },
        })
        expect(configChanges({ current, next })).toEqual([])
    })
})

describe('withConfigChanges', () => {
    test('sets a changed field and drops a removed one, leaving the rest', () => {
        const next = withConfigChanges({
            config: STARTED,
            changes: [
                { field: 'prepare', from: 'make rom', to: null },
                { field: 'prepare_concurrency', from: null, to: 3 },
            ],
        })

        expect(next).toEqual({
            checks: STARTED.checks,
            prepare_concurrency: 3,
            test_file_patterns: STARTED.test_file_patterns,
            test_setup_files: [],
            rule_files: [],
        })
        expect('prepare' in next).toBe(false)
    })

    test('sets a new test time limit, and drops a removed one (#542)', () => {
        const raised = withConfigChanges({
            config: STARTED,
            changes: [{ field: 'test_timeout_ms', from: null, to: 900_000 }],
        })

        expect(raised).toEqual({ ...STARTED, test_timeout_ms: 900_000 })

        const removed = withConfigChanges({
            config: raised,
            changes: [{ field: 'test_timeout_ms', from: 900_000, to: null }],
        })

        expect(removed).toEqual(STARTED)
        expect('test_timeout_ms' in removed).toBe(false)
    })

    test('sets a new fast test speed limit, and drops a removed one (#580)', () => {
        const set = withConfigChanges({
            config: STARTED,
            changes: [{ field: 'test_case_timeout_ms', from: null, to: 2000 }],
        })

        expect(set).toEqual({ ...STARTED, test_case_timeout_ms: 2000 })

        const removed = withConfigChanges({
            config: set,
            changes: [{ field: 'test_case_timeout_ms', from: 2000, to: null }],
        })

        expect(removed).toEqual(STARTED)
        expect('test_case_timeout_ms' in removed).toBe(false)
    })
})
