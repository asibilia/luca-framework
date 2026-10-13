import { describe, expect, test } from 'bun:test'

import { CaseSchema, GradeSchema, RowSchema } from './case-schema'

const VALID_CASE = {
    id: '3-machine-blamed',
    level: 3,
    task: 'Review diagnosis.md before we act on it, and write outcome.md.',
    skill_clause: 'Use the {skill} skill, Level 3, on diagnosis.md.',
    answer: {
        parts: [
            {
                name: 'real-cause',
                right: 'The tests fail because the port is in use.',
                caught_when: 'The outcome names the port clash as the cause.',
            },
        ],
        false_blocker_hint: '',
    },
    marker: 'LR-MARKER-3K7Q9ZT2',
    max_budget_usd: 25,
}

describe('CaseSchema', () => {
    test('a well-formed case parses, with empty defaults', () => {
        const parsed = CaseSchema.parse(VALID_CASE)
        expect(parsed.git_files).toEqual([])
        expect(parsed.git_diff).toBeNull()
        expect(parsed.plants).toEqual([])
        expect(parsed.absent_commands).toEqual([])
    })

    test('a skill clause without {skill} is refused', () => {
        expect(
            CaseSchema.safeParse({ ...VALID_CASE, skill_clause: 'Use it.' })
                .success
        ).toBe(false)
    })

    test('a marker in the wrong shape is refused', () => {
        expect(
            CaseSchema.safeParse({ ...VALID_CASE, marker: 'secret' }).success
        ).toBe(false)
    })

    test('a case with no answer parts is refused', () => {
        expect(
            CaseSchema.safeParse({
                ...VALID_CASE,
                answer: { parts: [], false_blocker_hint: '' },
            }).success
        ).toBe(false)
    })

    test('an id must be a number and a kebab-case name', () => {
        expect(
            CaseSchema.safeParse({ ...VALID_CASE, id: 'machine_blamed' })
                .success
        ).toBe(false)
    })
})

describe('GradeSchema', () => {
    test('a grade says, for each part, whether it was caught', () => {
        const grade = {
            parts: [{ name: 'real-cause', caught: true, evidence: '"port"' }],
            false_blockers: [],
            method: {
                closing_line_ok: null,
                register_exists: true,
                findings_checked_before_fix: true,
            },
        }
        expect(GradeSchema.parse(grade).person_note).toBeUndefined()
        expect(GradeSchema.safeParse({ ...grade, parts: [] }).success).toBe(
            false
        )
    })
})

describe('RowSchema', () => {
    test('caught is a share between 0 and 1', () => {
        const row = {
            case_id: '3-machine-blamed',
            arm: 'B',
            rep: 1,
            invalid_reason: null,
            caught: 0.5,
            false_blockers: 0,
            leaks: 0,
            cost_units: 1200,
            wall_ms: 60_000,
            claude_code_version: '2.1.296',
        }
        expect(RowSchema.parse(row).caught).toBe(0.5)
        expect(RowSchema.safeParse({ ...row, caught: 2 }).success).toBe(false)
    })
})
