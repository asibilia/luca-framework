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

// SF-8: hoist file reads to module scope — single disk read per file.
// Suite setup time fails if either file is missing, surfacing path errors
// at load time instead of buried inside individual tests.
const SKILL = readFileSync(SKILL_PATH, 'utf8')
const COMMAND = readFileSync(COMMAND_PATH, 'utf8')

describe('memory-audit skill — files exist', () => {
    test('SKILL.md exists at expected path and is non-empty', () => {
        expect(existsSync(SKILL_PATH)).toBe(true)
        expect(SKILL.length).toBeGreaterThan(1000)
    })

    test('slash-command shim exists with $ARGUMENTS and activates the skill', () => {
        expect(existsSync(COMMAND_PATH)).toBe(true)
        expect(COMMAND).toContain('$ARGUMENTS')
        expect(COMMAND).toMatch(/Activate the `memory-audit` skill/)
    })
})

describe('memory-audit skill — required headings (G-DX-003)', () => {
    const REQUIRED_HEADINGS = [
        '## Step 1 — Resolve vault and load state',
        '## Step 2 — Pre-apply confirmation gate',
        '## Step 3 — Paginate vault (hybrid cursor + semantic)',
        '## Step 4 — LLM-judge batch against tier rule',
        '## Step 5 — Apply trust corrections (gated)',
        '## Step 6 — Persist cursor and write report',
        '## Step 7 — Resume / completion',
    ]

    for (const heading of REQUIRED_HEADINGS) {
        test(`SKILL.md contains heading: ${heading}`, () => {
            expect(SKILL).toContain(heading)
        })
    }
})

describe('memory-audit skill — fenced prohibition block (G-DX-001, MF-4)', () => {
    // MF-4: extended from 5 to 11 tools — adds structurally-mutating tools
    // that could corrupt vault structure or graph topology.
    const FORBIDDEN_TOOLS = [
        'mcp__muninn__muninn_remember_batch',
        'mcp__muninn__muninn_forget',
        'mcp__muninn__muninn_consolidate',
        'mcp__muninn__muninn_evolve',
        'mcp__muninn__muninn_link',
        'mcp__muninn__muninn_state',
        'mcp__muninn__muninn_decide',
        'mcp__muninn__muninn_add_child',
        'mcp__muninn__muninn_remember_tree',
        'mcp__muninn__muninn_restore',
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

    const OUTSIDE = extractOutsideFences(SKILL)

    test('prohibition block fence markers present', () => {
        expect(SKILL).toContain('<!-- forbidden-tools-list-start -->')
        expect(SKILL).toContain('<!-- forbidden-tools-list-end -->')
    })

    for (const tool of FORBIDDEN_TOOLS) {
        test(`forbidden tool absent outside prohibition fences: ${tool}`, () => {
            expect(OUTSIDE).not.toContain(tool)
        })
    }

    // MF-5: identifier-form regex via negative-lookahead. Catches both
    // call-form `muninn_remember(` and bare prose mentions like
    // "do not call mcp__muninn__muninn_remember", while excluding
    // `mcp__muninn__muninn_remember_batch` (handled by FORBIDDEN_TOOLS above).
    test('bare muninn_remember (non-batch) absent outside prohibition fences as identifier', () => {
        expect(OUTSIDE).not.toMatch(/mcp__muninn__muninn_remember(?!_batch)/)
    })
})

describe('memory-audit skill — policy contracts', () => {
    test('--dry-run is the default mode', () => {
        expect(SKILL).toMatch(/`--dry-run`\s*\(default ON\)/)
    })

    test('--apply flag is required for mutations', () => {
        expect(SKILL).toContain('`--apply`')
    })

    test('--auto flag is documented (MF-3)', () => {
        // MF-3: replace undefined "full-auto oversight" branch with --auto flag.
        expect(SKILL).toContain('`--auto`')
        expect(SKILL).toMatch(/`--auto`.*only meaningful with `--apply`/)
    })

    test('citation-presence rule for verified is documented', () => {
        expect(SKILL).toMatch(/Citation-presence check/)
        expect(SKILL).toMatch(/promoted to `verified` only if/)
    })

    test('skill never assigns untrusted or modifies external (G-SCOPE-001)', () => {
        expect(SKILL).toMatch(
            /never\s+`untrusted`;\s+`external`\s+is left untouched/,
        )
    })

    test('trust-then-advance cursor ordering invariant is documented', () => {
        expect(SKILL).toMatch(/Ordering invariant/)
        expect(SKILL).toMatch(/AFTER all `mcp__muninn__muninn_trust` calls/)
    })

    test('cursor is batch-granular (no per-id advance)', () => {
        expect(SKILL).toMatch(/cursor is \*\*batch-granular\*\*/)
    })

    test('hybrid pagination strategy referenced (get_enrichment_candidates + recall)', () => {
        expect(SKILL).toContain(
            'mcp__muninn__muninn_get_enrichment_candidates',
        )
        expect(SKILL).toContain('mcp__muninn__muninn_recall')
    })
})

describe('memory-audit skill — vault drift guard (MF-1)', () => {
    test('state.json schema declares vault field', () => {
        expect(SKILL).toMatch(/"vault":\s*"<resolved-vault-name>"/)
    })

    test('vault drift abort prose is present and unconditional', () => {
        // Must say the check fires regardless of how the vault was resolved.
        expect(SKILL).toMatch(/Vault drift guard \(always-on\)/)
        expect(SKILL).toMatch(/Vault mismatch:/)
        expect(SKILL).toMatch(
            /regardless of how the vault was resolved/,
        )
    })

    test('pre-flight --apply confirmation gate documented', () => {
        // MF-1 fold-in (was SEC-2): irreversibility warning before mutations.
        expect(SKILL).toMatch(/Step 2 — Pre-apply confirmation gate/)
        expect(SKILL).toMatch(/effectively irreversible/)
    })
})

describe('memory-audit skill — lastRunAt set-time invariant (MF-2)', () => {
    test('schema seeds lastRunAt as empty string', () => {
        expect(SKILL).toMatch(
            /"lastRunAt":\s*"<ISO-timestamp-or-empty>"/,
        )
    })

    test('Step 6 explicitly sets lastRunAt before persist', () => {
        expect(SKILL).toMatch(
            /Set `state\.lastRunAt` to the current ISO timestamp/,
        )
    })

    test('Step 1 24-h idempotency guard requires lastRunAt !== ""', () => {
        expect(SKILL).toMatch(/state\.lastRunAt !== ""/)
    })
})

describe('memory-audit skill — totalsByTier split (SF-2)', () => {
    test('schema separates judgedByTier from appliedByTier', () => {
        expect(SKILL).toContain('"judgedByTier":')
        expect(SKILL).toContain('"appliedByTier":')
    })

    test('appliedByTier only contains verified and inferred keys', () => {
        // SF-2: external/untrusted are never applied; their counters were dead.
        expect(SKILL).toMatch(
            /"appliedByTier":\s*\{\s*"verified":\s*0,\s*"inferred":\s*0\s*\}/,
        )
    })
})

describe('memory-audit skill — pre-flight argument validation (SF-1)', () => {
    test('Pre-flight argument validation section present', () => {
        expect(SKILL).toMatch(/Pre-flight argument validation/)
    })

    test('--vault format constraint documented', () => {
        expect(SKILL).toMatch(/\^\[a-zA-Z0-9_\\?-\]\{1,64\}\$/)
    })

    test('--limit clamp documented', () => {
        expect(SKILL).toMatch(/clamp to `\[1, 200\]`/)
    })
})

describe('memory-audit skill — whitelist regression (T7)', () => {
    test('ROOT_WHITELIST_DIRS contains "audits"', () => {
        expect(ROOT_WHITELIST_DIRS.has('audits')).toBe(true)
    })
})
