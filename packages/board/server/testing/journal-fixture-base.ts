/**
 * What every fixture module builds on: the `Entry` type, `stamp`, the
 * `entry` builder, and the pieces more than one module shares (`testRun`,
 * `RESULTS`). `journal-fixtures.ts` re-exports only `Entry` and `stamp`.
 */
import type { EngineRecord } from '../../shared/board-rpc'

/** A record before the journal stamps its `seq` and `time`. */
export type Entry = Omit<EngineRecord, 'seq' | 'time'>

const BASE_TIME = Date.parse('2026-09-23T12:00:00.000Z')

/**
 * Stamps entries with `seq` 1, 2, 3, ... (from `first_seq`) and a time one
 * second apart, the way the engine's journal does.
 */
export const stamp = ({
    entries,
    first_seq = 1,
}: {
    entries: Entry[]
    first_seq?: number
}): EngineRecord[] =>
    entries.map((entry, index) => ({
        ...entry,
        seq: first_seq + index,
        time: new Date(BASE_TIME + (first_seq + index) * 1000).toISOString(),
    }))

export const entry = ({
    kind,
    content,
    ticket = null,
    role = null,
}: {
    kind: string
    content: unknown
    ticket?: number | null
    role?: string | null
}): Entry => ({ kind, content, ticket, role })

export const testRun = ({
    passed,
    failed,
}: {
    passed: number
    failed: number
}) => ({
    command: 'bun test',
    ok: failed === 0,
    exit_code: failed === 0 ? 0 : 1,
    no_test_files: false,
    cases: [
        ...Array.from({ length: passed }, (_, index) => ({
            file: 'a.test.ts',
            full_name: `passes ${index}`,
            status: 'passed',
        })),
        ...Array.from({ length: failed }, (_, index) => ({
            file: 'a.test.ts',
            full_name: `fails ${index}`,
            status: 'failed',
        })),
    ],
    files_without_results: [],
    output: '',
})

export const RESULTS: Record<string, unknown> = {
    'test-writer': {
        outcome: 'tests_written',
        criteria: [{ criterion_id: 'AC1', tests: [] }],
        summary: '',
        assumptions: [],
        run_notes: [],
    },
    implementer: {
        outcome: 'done',
        bad_test: null,
        summary: '',
        assumptions: [],
        run_notes: [],
    },
    'ticket-reviewer': {
        verdict: 'approve',
        findings: [],
        summary: '',
        assumptions: [],
    },
}
