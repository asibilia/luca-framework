import { mkdtempSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { CaseSchema } from './case-schema'
import {
    MAX_FILE_CHARS,
    caughtShare,
    graderPrompt,
    parseGrade,
    redact,
    runOutputs,
} from './grade'
import { workspaceHashes } from './workspace'

const FENCE = '`'.repeat(3)

let tmp = ''

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'lr-gr-'))
})

afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
})

const THE_CASE = CaseSchema.parse({
    id: '3-machine-blamed',
    level: 3,
    task: 'Review diagnosis.md before we act on it, and write outcome.md.',
    skill_clause: 'Use the {skill} skill, Level 3, on diagnosis.md.',
    answer: {
        parts: [
            {
                name: 'real-cause',
                right: 'The server tests fail because port 4000 is in use.',
                caught_when: 'The outcome names the port clash as the cause.',
            },
            {
                name: 'revert-wrong',
                right: 'Reverting the rounding change would not fix anything.',
                caught_when: 'The outcome says not to revert the change.',
            },
        ],
        false_blocker_hint: 'Count any blocker blaming formatPrice.',
    },
    marker: 'LR-MARKER-3K7Q9ZT2',
    max_budget_usd: 25,
})

const GOOD_GRADE = {
    parts: [
        {
            name: 'real-cause',
            caught: true,
            evidence: '"port 4000 was in use"',
        },
        { name: 'revert-wrong', caught: false, evidence: 'not mentioned' },
    ],
    false_blockers: [],
    method: {
        closing_line_ok: null,
        register_exists: true,
        findings_checked_before_fix: true,
    },
}

describe('redact', () => {
    test('hides which skill ran', () => {
        expect(redact({ text: 'I used Agent-Review, then luca-review.' })).toBe(
            'I used the-skill, then the-skill.'
        )
    })
})

describe('runOutputs', () => {
    test('keeps what the run wrote or changed, and the review root, not the rest', async () => {
        const ws = join(tmp, 'ws')
        const reviews = join(tmp, 'reviews')
        await mkdir(join(ws, '.claude', 'skills', 's'), { recursive: true })
        await mkdir(join(ws, 'tmp'), { recursive: true })
        await mkdir(join(ws, 'node_modules', 'pkg'), { recursive: true })
        await mkdir(join(reviews, 'workspaces', 'r1'), { recursive: true })
        await mkdir(join(reviews, 'sessions', 's1'), { recursive: true })
        await Bun.write(join(ws, 'given.md'), 'given\n')
        await Bun.write(join(ws, 'changed.md'), 'before\n')
        const baseline = workspaceHashes({ ws })
        await Bun.write(join(ws, 'changed.md'), 'after\n')
        await Bun.write(join(ws, 'outcome.md'), 'the outcome\n')
        await Bun.write(join(ws, 'image.png'), 'binary-ish')
        await Bun.write(
            join(ws, '.claude', 'skills', 's', 'SKILL.md'),
            'skill\n'
        )
        await Bun.write(join(ws, 'tmp', 'scratch.md'), 'scratch\n')
        await Bun.write(join(ws, 'node_modules', 'pkg', 'readme.md'), 'doc\n')
        await Bun.write(join(reviews, 'findings.md'), 'register\n')
        await Bun.write(join(reviews, 'findings.json'), 'data\n')
        await Bun.write(join(reviews, 'workspaces', 'r1', 'copy.md'), 'raw\n')
        await Bun.write(join(reviews, 'sessions', 's1', 'log.md'), 'session\n')
        expect(
            runOutputs({ ws, baseline, reviews_dir: reviews }).map(
                (file) => file.path
            )
        ).toEqual(['changed.md', 'outcome.md', 'review root/findings.md'])
    })

    test('cuts a long file', async () => {
        const ws = join(tmp, 'ws')
        await mkdir(ws, { recursive: true })
        await Bun.write(join(ws, 'long.md'), 'x'.repeat(MAX_FILE_CHARS + 10))
        const [file] = runOutputs({
            ws,
            baseline: {},
            reviews_dir: join(tmp, 'none'),
        })
        expect(file?.text).toEndWith('[cut: 10 more characters]')
    })

    test('respects the total size cap with exact count and text', async () => {
        const ws = join(tmp, 'ws')
        const reviews = join(tmp, 'reviews')
        await mkdir(ws, { recursive: true })
        await mkdir(reviews, { recursive: true })
        const baseline: Record<string, string> = {}
        const filler = 'x'.repeat(MAX_FILE_CHARS)
        for (let i = 0; i < 9; i++) {
            const path = join(ws, `file${i}.md`)
            await Bun.write(path, filler)
            baseline[`file${i}.md`] = 'old'
        }
        const files = runOutputs({ ws, baseline, reviews_dir: reviews })
        expect(files.length).toBe(9)
        const before = files.slice(0, 8)
        expect(before.map((f) => f.path)).toEqual([
            'file0.md',
            'file1.md',
            'file2.md',
            'file3.md',
            'file4.md',
            'file5.md',
            'file6.md',
            'file7.md',
        ])
        const moreFiles = files[8]
        expect(moreFiles?.path).toBe('(more files)')
        expect(moreFiles?.text).toBe(
            '1 more file left out: the size cap was reached.'
        )
    })

    test('uses correct grammar for 2+ remaining files', async () => {
        const ws = join(tmp, 'ws')
        const reviews = join(tmp, 'reviews')
        await mkdir(ws, { recursive: true })
        await mkdir(reviews, { recursive: true })
        const baseline: Record<string, string> = {}
        const filler = 'x'.repeat(MAX_FILE_CHARS)
        for (let i = 0; i < 10; i++) {
            const path = join(ws, `file${i}.md`)
            await Bun.write(path, filler)
            baseline[`file${i}.md`] = 'old'
        }
        const files = runOutputs({
            ws,
            baseline,
            reviews_dir: reviews,
        })
        const moreFiles = files[files.length - 1]
        expect(moreFiles?.path).toBe('(more files)')
        expect(moreFiles?.text).toBe(
            '2 more files left out: the size cap was reached.'
        )
    })
})

describe('graderPrompt', () => {
    test('has the task, every answer part, the report and the files, with skill names hidden', () => {
        const prompt = graderPrompt({
            the_case: THE_CASE,
            report: 'luca-review says: the port is in use.',
            files: [{ path: 'outcome.md', text: 'agent-review outcome' }],
        })
        expect(prompt).toContain(THE_CASE.task)
        expect(prompt).toContain('This is a Level 3 task.')
        expect(prompt).toContain('### real-cause')
        expect(prompt).toContain('### revert-wrong')
        expect(prompt).toContain('Count any blocker blaming formatPrice.')
        expect(prompt).toContain('the-skill says: the port is in use.')
        expect(prompt).toContain('### outcome.md')
        expect(prompt).not.toMatch(/agent-review|luca-review/i)
    })
})

describe('parseGrade', () => {
    test('reads a fenced JSON block, or bare JSON', () => {
        const fenced = `Here it is.\n\n${FENCE}json\n${JSON.stringify(GOOD_GRADE)}\n${FENCE}\n`
        expect(
            parseGrade({ text: fenced, the_case: THE_CASE }).parts
        ).toHaveLength(2)
        expect(
            parseGrade({ text: JSON.stringify(GOOD_GRADE), the_case: THE_CASE })
                .method.register_exists
        ).toBe(true)
    })

    test('refuses a grade that skips or renames an answer part', () => {
        const [first] = GOOD_GRADE.parts
        expect(() =>
            parseGrade({
                text: JSON.stringify({ ...GOOD_GRADE, parts: [first] }),
                the_case: THE_CASE,
            })
        ).toThrow("don't match")
    })

    test('refuses prose with no JSON', () => {
        expect(() =>
            parseGrade({
                text: 'It caught the port clash.',
                the_case: THE_CASE,
            })
        ).toThrow()
    })
})

describe('caughtShare', () => {
    test('is the share of parts caught', () => {
        expect(
            caughtShare({
                grade: parseGrade({
                    text: JSON.stringify(GOOD_GRADE),
                    the_case: THE_CASE,
                }),
            })
        ).toBe(0.5)
    })
})
