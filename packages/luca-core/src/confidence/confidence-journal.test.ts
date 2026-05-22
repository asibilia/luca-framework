import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, spyOn, test } from 'bun:test'

import { ConfidenceEntrySchema, type ConfidenceEntry } from './schemas.ts'
import {
    appendConfidenceEntry,
    getConfidenceSummary,
    readConfidenceJournal,
    renderConfidenceJournalMarkdown,
} from './confidence-journal.ts'

const tmpDirs: string[] = []
const SLUG = '01-phase-one'

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-confidence-'))
    tmpDirs.push(dir)
    return dir
}

function entry(overrides: Partial<ConfidenceEntry> = {}): ConfidenceEntry {
    return {
        timestamp: '2026-05-22T10:00:00.000Z',
        phase: 'Phase One',
        wave: 1,
        task: 'wire the thing',
        confidence: 'high',
        category: 'design-choice',
        decision: 'used a factory function',
        alternatives: ['a class'],
        reasoning: 'functional style is the house rule',
        risk: 'none material',
        files: ['a.ts'],
        ...overrides,
    }
}

/** Strip the timestamp — appendConfidenceEntry stamps it. */
function bare(e: ConfidenceEntry): Omit<ConfidenceEntry, 'timestamp'> {
    const { timestamp: _ts, ...rest } = e
    return rest
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('appendConfidenceEntry + readConfidenceJournal', () => {
    test('writes to .luca/phases/<slug>/confidence.jsonl and stamps a timestamp', () => {
        const cwd = cleanDir()
        const written = appendConfidenceEntry({
            cwd,
            slug: SLUG,
            entry: bare(entry()),
        })
        expect(written.timestamp).toBe(new Date(written.timestamp).toISOString())
        const journal = readConfidenceJournal({ cwd, slug: SLUG })
        expect(journal.length).toBe(1)
        expect(journal[0]?.task).toBe('wire the thing')
    })

    test('appends entries in order', () => {
        const cwd = cleanDir()
        appendConfidenceEntry({ cwd, slug: SLUG, entry: bare(entry({ task: 'one' })) })
        appendConfidenceEntry({ cwd, slug: SLUG, entry: bare(entry({ task: 'two' })) })
        expect(
            readConfidenceJournal({ cwd, slug: SLUG }).map((e) => e.task)
        ).toEqual(['one', 'two'])
    })

    test('returns [] when the journal does not exist', () => {
        expect(readConfidenceJournal({ cwd: cleanDir(), slug: SLUG })).toEqual(
            []
        )
    })

    test('skips malformed lines and warns', () => {
        const cwd = cleanDir()
        appendConfidenceEntry({ cwd, slug: SLUG, entry: bare(entry()) })
        const p = join(cwd, '.luca', 'phases', SLUG, 'confidence.jsonl')
        writeFileSync(p, `${readFileSync(p, 'utf-8')}not json\n`)
        const warn = spyOn(console, 'warn').mockImplementation(() => {})
        const journal = readConfidenceJournal({ cwd, slug: SLUG })
        expect(journal.length).toBe(1)
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})

describe('getConfidenceSummary', () => {
    test('counts by confidence level and category', () => {
        const summary = getConfidenceSummary([
            entry({ confidence: 'high', category: 'design-choice' }),
            entry({ confidence: 'low', category: 'plan-gap' }),
            entry({ confidence: 'low', category: 'plan-gap' }),
        ])
        expect(summary.total).toBe(3)
        expect(summary.high).toBe(1)
        expect(summary.low).toBe(2)
        expect(summary.medium).toBe(0)
        expect(summary.categories['plan-gap']).toBe(2)
        expect(summary.categories['design-choice']).toBe(1)
    })

    test('returns zeros for no entries', () => {
        const summary = getConfidenceSummary([])
        expect(summary.total).toBe(0)
        expect(summary.categories).toEqual({})
    })
})

describe('renderConfidenceJournalMarkdown', () => {
    test('renders an empty-state message for no entries', () => {
        expect(renderConfidenceJournalMarkdown([])).toContain(
            'No entries recorded yet'
        )
    })

    test('renders summary, phase grouping and a low-confidence warning', () => {
        const md = renderConfidenceJournalMarkdown([
            entry({ confidence: 'high', phase: 'Phase One' }),
            entry({ confidence: 'low', phase: 'Phase One', category: 'plan-gap' }),
        ])
        expect(md).toContain('# Confidence Journal')
        expect(md).toContain('## Summary')
        expect(md).toContain('## Phase One')
        expect(md).toContain('🔴')
        expect(md).toContain('low-confidence decision')
    })

    test('does not write any file to disk', () => {
        const cwd = cleanDir()
        renderConfidenceJournalMarkdown([entry()])
        // render is pure — it must not touch the filesystem.
        expect(existsSync(join(cwd, '.luca'))).toBe(false)
    })
})

describe('ConfidenceEntrySchema', () => {
    test('rejects an unknown confidence level', () => {
        expect(
            ConfidenceEntrySchema.safeParse(
                entry({ confidence: 'unsure' as never })
            ).success
        ).toBe(false)
    })
})
