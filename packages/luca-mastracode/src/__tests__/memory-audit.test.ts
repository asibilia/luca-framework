import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { ROOT_WHITELIST_DIRS } from '../tools/repo-cleanup.js'

/**
 * memory-audit skill regression suite.
 *
 * The skill itself is markdown prose — runtime behavior cannot be unit-tested.
 * These tests enforce structural and contract invariants of the SKILL.md so
 * the skill's safety guarantees survive future edits.
 */

const PKG_ROOT = join(__dirname, '..', '..')
const SKILL_PATH = join(PKG_ROOT, 'skills', 'memory-audit', 'SKILL.md')
const COMMAND_PATH = join(PKG_ROOT, 'commands', 'memory-audit.md')

function readSkill(): string {
    return readFileSync(SKILL_PATH, 'utf8')
}

function readCommand(): string {
    return readFileSync(COMMAND_PATH, 'utf8')
}

describe('memory-audit skill — files exist', () => {
    test('SKILL.md exists at expected path and is non-empty', () => {
        expect(existsSync(SKILL_PATH)).toBe(true)
        const content = readSkill()
        expect(content.length).toBeGreaterThan(1000)
    })

    test('slash-command shim exists with $ARGUMENTS and activates the skill', () => {
        expect(existsSync(COMMAND_PATH)).toBe(true)
        const content = readCommand()
        expect(content).toContain('$ARGUMENTS')
        expect(content).toMatch(/Activate the `memory-audit` skill/)
    })
})

describe('memory-audit skill — required headings (G-DX-003)', () => {
    const REQUIRED_HEADINGS = [
        '## Step 1 — Resolve vault and load state',
        '## Step 2 — Paginate vault (hybrid cursor + semantic)',
        '## Step 3 — LLM-judge batch against tier rule',
        '## Step 4 — Apply trust corrections (gated)',
        '## Step 5 — Persist cursor and write report',
        '## Step 6 — Resume / completion',
    ]

    for (const heading of REQUIRED_HEADINGS) {
        test(`SKILL.md contains heading: ${heading}`, () => {
            const content = readSkill()
            expect(content).toContain(heading)
        })
    }
})

describe('memory-audit skill — fenced prohibition block (G-DX-001)', () => {
    const FORBIDDEN_TOOLS = [
        'mcp__muninn__muninn_remember_batch',
        'mcp__muninn__muninn_forget',
        'mcp__muninn__muninn_consolidate',
        'mcp__muninn__muninn_evolve',
    ]

    function extractOutsideFences(content: string): string {
        const startMarker = '<!-- forbidden-tools-list-start -->'
        const endMarker = '<!-- forbidden-tools-list-end -->'
        const startIdx = content.indexOf(startMarker)
        const endIdx = content.indexOf(endMarker)
        if (startIdx === -1 || endIdx === -1) {
            throw new Error(
                'forbidden-tools fence markers missing from SKILL.md',
            )
        }
        return (
            content.slice(0, startIdx) +
            content.slice(endIdx + endMarker.length)
        )
    }

    test('prohibition block fence markers present', () => {
        const content = readSkill()
        expect(content).toContain('<!-- forbidden-tools-list-start -->')
        expect(content).toContain('<!-- forbidden-tools-list-end -->')
    })

    for (const tool of FORBIDDEN_TOOLS) {
        test(`forbidden tool absent outside prohibition fences: ${tool}`, () => {
            const outside = extractOutsideFences(readSkill())
            // Allow the tool name to appear in `mcp__muninn__muninn_*` form
            // ONLY inside the fenced block. Outside the fences, it is a
            // scope-creep violation.
            expect(outside).not.toContain(tool)
        })
    }

    test('bare muninn_remember (non-batch) absent outside prohibition fences', () => {
        const outside = extractOutsideFences(readSkill())
        // Match bare `mcp__muninn__muninn_remember(` (call form) outside
        // fences. Word-boundary in plain string includes `_batch` suffix
        // checks above; this asserts no remember(...) call.
        expect(outside).not.toMatch(/mcp__muninn__muninn_remember\s*\(/)
    })
})

describe('memory-audit skill — policy contracts', () => {
    test('--dry-run is the default mode (T5)', () => {
        const content = readSkill()
        expect(content).toMatch(/`--dry-run`\s*\(default ON\)/)
    })

    test('--apply flag is required for mutations', () => {
        const content = readSkill()
        expect(content).toContain('`--apply`')
    })

    test('citation-presence rule for verified is documented (T6)', () => {
        const content = readSkill()
        expect(content).toMatch(/citation/i)
        expect(content).toMatch(/Citation-presence check/)
    })

    test('skill never assigns untrusted or modifies external (G-SCOPE-001)', () => {
        const content = readSkill()
        expect(content).toMatch(
            /never assigns `untrusted` or modifies `external`/,
        )
    })

    test('trust-then-advance cursor ordering invariant is documented', () => {
        const content = readSkill()
        expect(content).toMatch(/Ordering invariant/)
        expect(content).toMatch(/AFTER all `mcp__muninn__muninn_trust` calls/)
    })

    test('hybrid pagination strategy referenced (get_enrichment_candidates + recall)', () => {
        const content = readSkill()
        expect(content).toContain('mcp__muninn__muninn_get_enrichment_candidates')
        expect(content).toContain('mcp__muninn__muninn_recall')
    })
})

describe('memory-audit skill — whitelist regression (T7)', () => {
    test('ROOT_WHITELIST_DIRS contains "audits"', () => {
        expect(ROOT_WHITELIST_DIRS.has('audits')).toBe(true)
    })
})
