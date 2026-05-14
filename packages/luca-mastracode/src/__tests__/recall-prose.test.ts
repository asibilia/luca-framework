/**
 * Region-scoped prose tests for `record-recall` directive presence in all 5
 * mode instruction files: triage, architect, execute, review, finalize.
 *
 * Asserts:
 *   - Each file contains at least one `// → record-recall { ... }` directive
 *   - The directive is NOT inside a fenced code block (PR #247 lesson: agents
 *     treat fenced blocks as documentation, not executable directives)
 *
 * Fence-split logic: split on triple-backtick; even-indexed chunks are
 * outside fences, odd-indexed chunks are inside. Scan even-indexed chunks
 * only for `record-recall` matches.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, test, expect } from 'bun:test'

const INSTRUCTIONS_DIR = join(
    new URL('.', import.meta.url).pathname,
    '..',
    'instructions'
)

const FILES = [
    'triage.md',
    'architect.md',
    'execute.md',
    'review.md',
    'finalize.md',
]

describe.each(FILES)('record-recall directive in %s', (filename) => {
    const raw = readFileSync(join(INSTRUCTIONS_DIR, filename), 'utf8')
    // Split on ``` fences. Chunks at even indices are OUTSIDE code fences;
    // chunks at odd indices are INSIDE.
    const chunks = raw.split('```')
    const outsideFences = chunks.filter((_, i) => i % 2 === 0).join('\n')
    const insideFences = chunks.filter((_, i) => i % 2 === 1).join('\n')

    test('contains at least one record-recall directive', () => {
        expect(raw).toContain('record-recall')
    })

    test('record-recall directive appears OUTSIDE fenced code blocks', () => {
        expect(outsideFences).toContain('record-recall')
    })

    test('// → directive form is inline (not fenced)', () => {
        // The arrow-prefixed inline directive is the canonical executable form.
        // We accept any occurrence outside fences as long as it begins with
        // `// →`.
        expect(outsideFences).toMatch(/\/\/\s*→\s*record-recall/)
    })

    test('no record-recall directive appears INSIDE a fenced code block', () => {
        // Inside-fence occurrences would suggest the directive is being
        // documented (decorative), not invoked. PR #247 lesson: agents skip
        // fenced blocks as documentation.
        expect(insideFences).not.toMatch(/\/\/\s*→\s*record-recall/)
    })
})

describe('record-recall directive coverage', () => {
    test('all 5 mode files have at least one inline directive', () => {
        const counts: Record<string, number> = {}
        for (const filename of FILES) {
            const raw = readFileSync(join(INSTRUCTIONS_DIR, filename), 'utf8')
            const outside = raw
                .split('```')
                .filter((_, i) => i % 2 === 0)
                .join('\n')
            counts[filename] = (
                outside.match(/\/\/\s*→\s*record-recall/g) ?? []
            ).length
        }
        for (const filename of FILES) {
            expect(counts[filename] ?? 0).toBeGreaterThanOrEqual(1)
        }
    })
})
