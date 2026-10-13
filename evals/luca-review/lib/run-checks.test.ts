import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { RowSchema, type Row, type Trigger } from './case-schema'
import { reportText } from './decide'
import {
    NO_RESULT_REASON,
    UNFINISHED_REASON,
    WALL_UNKNOWN_REASON,
    caseIds,
    completeTriggerResults,
    hasResultEvent,
    missingGradeOnlyFile,
    parseRunFolder,
    runFailed,
    runLine,
    savedWallMs,
    unfinishedRow,
} from './run-checks'

let tmp = ''

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lr-checks-'))
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

const row = (over: Partial<Row>): Row => ({
    case_id: '4-planted-bug',
    arm: 'A',
    rep: 1,
    invalid_reason: null,
    caught: 1,
    false_blockers: 0,
    leaks: 0,
    cost_units: 1000,
    wall_ms: 600_000,
    claude_code_version: '2.1.296',
    ...over,
})

describe('hasResultEvent', () => {
    const init = '{"type":"system","subtype":"init","session_id":"s"}'
    const result = '{"type":"result","is_error":false,"result":"done"}'

    test('is true when the stream has a result event', () => {
        expect(hasResultEvent({ text: `${init}\n${result}\n` })).toBe(true)
    })

    test('is true for a result event with is_error set: it finished, in an error', () => {
        expect(
            hasResultEvent({
                text: `${init}\n{"type":"result","is_error":true}\n`,
            })
        ).toBe(true)
    })

    test('is false for a stream cut off before its result (a timeout or a crash)', () => {
        expect(
            hasResultEvent({ text: `${init}\n{"type":"assistant"}\n` })
        ).toBe(false)
    })

    test('is false for an empty stream', () => {
        expect(hasResultEvent({ text: '' })).toBe(false)
    })

    test('ignores lines that are not JSON, or not objects', () => {
        expect(
            hasResultEvent({
                text: `not json\n\n5\nnull\n"result"\n{"type":"result"\n`,
            })
        ).toBe(false)
    })

    test('does not count the word "result" inside another event', () => {
        expect(
            hasResultEvent({
                text: '{"type":"user","message":{"type":"result"}}\n{"type":"assistant","result":"x"}\n',
            })
        ).toBe(false)
    })

    test('finds a result event after a partial last line is ignored', () => {
        expect(hasResultEvent({ text: `${result}\n{"type":"assis` })).toBe(true)
    })
})

describe('parseRunFolder', () => {
    test('reads case number, setup and rep', () => {
        expect(parseRunFolder({ name: '3B2' })).toEqual({
            case_number: '3',
            arm: 'B',
            rep: 2,
        })
        expect(parseRunFolder({ name: '5C12' })).toEqual({
            case_number: '5',
            arm: 'C',
            rep: 12,
        })
    })

    test('is null for names that are not run folders', () => {
        for (const name of [
            'grader',
            'tA1',
            '3D1',
            '0A1',
            '3A',
            '3A0',
            '3a1',
            '33A1',
            '3A1x',
            'r1-notes',
            '',
        ]) {
            expect(parseRunFolder({ name })).toBeNull()
        }
    })
})

describe('caseIds', () => {
    test('lists the numbered case folders, sorted, and nothing else', () => {
        for (const name of ['5-clean', '1-first', 'notes', '.DS_Store']) {
            mkdirSync(join(tmp, name))
        }
        expect(caseIds({ cases_dir: tmp })).toEqual(['1-first', '5-clean'])
    })

    test('is empty when the cases folder does not exist yet', () => {
        expect(caseIds({ cases_dir: join(tmp, 'nope') })).toEqual([])
    })
})

describe('unfinishedRow', () => {
    const case_ids = ['1-wrong-finding', '3-machine-blamed']

    test('is an invalid row for the folder, with the case found from its number', () => {
        const made = unfinishedRow({ name: '3B2', case_ids })
        expect(made).toEqual({
            case_id: '3-machine-blamed',
            arm: 'B',
            rep: 2,
            invalid_reason: UNFINISHED_REASON,
            caught: null,
            false_blockers: null,
            leaks: 0,
            cost_units: 0,
            wall_ms: 0,
            claude_code_version: 'unknown',
        })
        expect(RowSchema.safeParse(made).success).toBe(true)
    })

    test('a case number that matches no case becomes unknown-<n>', () => {
        expect(unfinishedRow({ name: '7A1', case_ids })?.case_id).toBe(
            'unknown-7'
        )
        expect(unfinishedRow({ name: '3A1', case_ids: [] })?.case_id).toBe(
            'unknown-3'
        )
    })

    test('does not take a case whose number only starts the same', () => {
        expect(
            unfinishedRow({ name: '1A1', case_ids: ['11-eleven'] })?.case_id
        ).toBe('unknown-1')
    })

    test('is null for a folder that is not a run', () => {
        expect(unfinishedRow({ name: 'grader', case_ids })).toBeNull()
        expect(unfinishedRow({ name: 'tA1', case_ids })).toBeNull()
    })

    test('shows under "Runs left out" in the report, and its case blocks the decision', () => {
        const unfinished = unfinishedRow({ name: '3B1', case_ids })
        if (unfinished === null) throw new Error('expected a row')
        const text = reportText({
            round: 'r1',
            rows: [
                row({ case_id: '3-machine-blamed', arm: 'A', rep: 1 }),
                unfinished,
            ],
            triggers: null,
        })
        expect(text).toContain(`- 3B1: ${UNFINISHED_REASON}`)
        expect(text).toContain(
            'case 3-machine-blamed has no graded runs of A or of B'
        )
        expect(text).toContain('**B does not ship yet:**')
    })
})

describe('missingGradeOnlyFile', () => {
    const build = (files: string[]) => {
        for (const file of files) {
            const path = join(tmp, file)
            if (file === 'ws') {
                mkdirSync(path, { recursive: true })
            } else {
                mkdirSync(join(tmp, 'out'), { recursive: true })
                writeFileSync(path, '')
            }
        }
    }

    test('is null when the workspace, baseline and stream are all there', () => {
        build(['ws', 'out/baseline.json', 'out/stream.jsonl'])
        expect(missingGradeOnlyFile({ root: tmp })).toBeNull()
    })

    test('names the baseline when it is missing', () => {
        build(['ws', 'out/stream.jsonl'])
        expect(missingGradeOnlyFile({ root: tmp })).toBe('out/baseline.json')
    })

    test('names the stream when it is missing', () => {
        build(['ws', 'out/baseline.json'])
        expect(missingGradeOnlyFile({ root: tmp })).toBe('out/stream.jsonl')
    })

    test('names the workspace when it is missing', () => {
        build(['out/baseline.json', 'out/stream.jsonl'])
        expect(missingGradeOnlyFile({ root: tmp })).toBe('ws')
    })

    test('names the workspace first when the whole run folder is missing', () => {
        expect(missingGradeOnlyFile({ root: join(tmp, 'nope') })).toBe('ws')
    })

    test('does not need row.json: a missing one is handled as a wall time that is unknown', () => {
        build(['ws', 'out/baseline.json', 'out/stream.jsonl'])
        expect(missingGradeOnlyFile({ root: tmp })).not.toBe('out/row.json')
    })
})

describe('savedWallMs', () => {
    test('is the saved wall time of an earlier row', () => {
        expect(savedWallMs({ row: row({ wall_ms: 123_000 }) })).toBe(123_000)
    })

    test('is null when there is no earlier row, never 0', () => {
        expect(savedWallMs({ row: null })).toBeNull()
    })

    test('is null when the earlier row already marked the wall time unknown', () => {
        expect(
            savedWallMs({
                row: row({ invalid_reason: WALL_UNKNOWN_REASON, wall_ms: 0 }),
            })
        ).toBeNull()
    })

    test('keeps the wall time of an earlier row that was invalid for another reason', () => {
        expect(
            savedWallMs({
                row: row({ invalid_reason: NO_RESULT_REASON, wall_ms: 5000 }),
            })
        ).toBe(5000)
    })
})

describe('runFailed', () => {
    test('an invalid run failed', () => {
        expect(
            runFailed({
                row: row({ invalid_reason: 'x', caught: null }),
                grading: false,
            })
        ).toBe(true)
    })

    test('a valid, graded run did not', () => {
        expect(runFailed({ row: row({}), grading: true })).toBe(false)
    })

    test('a valid run left ungraded failed, unless grading was off', () => {
        const ungraded = row({ caught: null, false_blockers: null })
        expect(runFailed({ row: ungraded, grading: true })).toBe(true)
        expect(runFailed({ row: ungraded, grading: false })).toBe(false)
    })
})

describe('runLine', () => {
    test('prints a valid run: its numbers', () => {
        expect(
            runLine({
                row: row({ cost_units: 5000, wall_ms: 90_000 }),
                is_error: false,
            })
        ).toBe(
            '4-planted-bug A1: caught 1, false blockers 0, leaks 0, 5000 cost units, 1.5 min'
        )
    })

    test('prints an invalid run: its reason', () => {
        expect(
            runLine({
                row: row({ invalid_reason: NO_RESULT_REASON, caught: null }),
                is_error: true,
            })
        ).toBe(`4-planted-bug A1: ${NO_RESULT_REASON}, is_error true`)
    })

    test('says is_error for a valid run that ended in an error, and only then', () => {
        expect(runLine({ row: row({}), is_error: true })).toEndWith(
            ', is_error true'
        )
        expect(runLine({ row: row({}), is_error: false })).not.toContain(
            'is_error'
        )
    })

    test('says ungraded when there is no grade', () => {
        expect(
            runLine({
                row: row({ caught: null, false_blockers: null }),
                is_error: false,
            })
        ).toContain('caught ungraded, false blockers ?')
    })
})

describe('completeTriggerResults', () => {
    const triggers: Trigger[] = [
        { prompt: 'first prompt here', should_trigger: true },
        { prompt: 'second prompt here', should_trigger: false },
        { prompt: 'third prompt here', should_trigger: true },
    ]
    const done = (prompt: string, should_trigger: boolean) => ({
        prompt,
        should_trigger,
        triggered: should_trigger,
        invalid_reason: null,
    })

    test('keeps a full set of results as they are', () => {
        const results = [
            done('first prompt here', true),
            done('second prompt here', false),
            done('third prompt here', true),
        ]
        expect(completeTriggerResults({ results, triggers })).toEqual(results)
    })

    test('fills each missing prompt with an invalid result', () => {
        const filled = completeTriggerResults({
            results: [done('first prompt here', true)],
            triggers,
        })
        expect(filled).toHaveLength(3)
        expect(filled[0]).toEqual(done('first prompt here', true))
        expect(filled[1]).toEqual({
            prompt: 'second prompt here',
            should_trigger: false,
            triggered: false,
            invalid_reason: 'not run: the trigger test stopped early',
        })
        expect(filled[2]?.prompt).toBe('third prompt here')
        expect(filled[2]?.invalid_reason).not.toBeNull()
    })

    test('an empty file is all placeholders', () => {
        const filled = completeTriggerResults({ results: [], triggers })
        expect(filled.every((r) => r.invalid_reason !== null)).toBe(true)
    })
})
