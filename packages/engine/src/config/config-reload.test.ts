import { describe, expect, test } from 'bun:test'

import {
    configChanges,
    FROZEN_FIELDS,
    RELOADED_FIELDS,
    withConfigChanges,
} from './config-reload'
import { EngineConfigSchema, type EngineConfig } from './engine-config'

/**
 * A resume re-reads the repo's config (#PRNUM): only the build fields
 * (`prepare`, `prepare_timeout_ms`, `prepare_concurrency`) may change in a
 * run; every other field stays as the run started with it.
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
})
