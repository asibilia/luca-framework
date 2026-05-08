/**
 * Memory Tier Callsite — Pattern 1 (filesystem walk + regex scan).
 *
 * For every `muninn_remember` / `muninn_remember_batch` invocation in
 * instruction prose, asserts a `Tier: (verified|inferred|external|untrusted)`
 * marker appears within 30 lines preceding the call.
 *
 * 30-line window chosen to accommodate fenced-block intro headers (~5 lines)
 * + bullet/list-item context (~25 lines) without false negatives. If a
 * callsite genuinely needs more context above the marker, restructure the
 * surrounding prose rather than widen the window — the contract is "tier
 * decision is visible adjacent to the write".
 *
 * Excludes:
 *   - src/__tests__/ (test fixtures may reference muninn_remember in literals)
 *   - src/memory-tier-discipline.ts (the rule itself documents the call)
 *   - dist/ build output
 */
import type { Dirent } from 'node:fs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { describe, expect, test } from 'bun:test'

const here = url.fileURLToPath(import.meta.url)
const PKG_ROOT = path.resolve(here, '..', '..', '..')

const SCAN_ROOTS = [
    'src/instructions',
    'src/subagents',
    'src/tools',
    'skills',
    'commands',
]

const ALLOWLIST = [
    /__tests__\//,
    /memory-tier-discipline\.ts$/,
    /dist\//,
]

const REMEMBER_RE = /mcp__muninn__muninn_remember(?:_batch)?\s*\(/
// Accept all four tiers from MEMORY_TIER_DISCIPLINE so legitimate `external`
// markers (e.g. seeded preferences) and `untrusted` markers (debug-only) pass
// the scan. See `src/memory-tier-discipline.ts` for the canonical tier list.
const TIER_RE = /Tier:\s*(verified|inferred|external|untrusted)/

const TIER_LOOKBACK_LINES = 30

function* walk(dir: string): Generator<string> {
    let entries: Dirent[]
    try {
        entries = readdirSync(dir, { withFileTypes: true }) as Dirent[]
    } catch {
        return
    }
    for (const e of entries) {
        const full = path.join(dir, String(e.name))
        if (ALLOWLIST.some((re) => re.test(full))) continue
        if (e.isDirectory()) yield* walk(full)
        else if (e.isFile()) yield full
    }
}

function gatherCandidateFiles(): string[] {
    const out: string[] = []
    for (const root of SCAN_ROOTS) {
        const abs = path.join(PKG_ROOT, root)
        try {
            statSync(abs)
        } catch {
            continue
        }
        for (const f of walk(abs)) {
            if (
                f.endsWith('.md') ||
                f.endsWith('.ts') ||
                f.endsWith('.tsx')
            ) {
                out.push(f)
            }
        }
    }
    return out
}

function findRememberCallsites(
    body: string,
): { lineIdx: number; line: string }[] {
    const lines = body.split('\n')
    const hits: { lineIdx: number; line: string }[] = []
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i] ?? ''
        if (REMEMBER_RE.test(ln)) hits.push({ lineIdx: i, line: ln })
    }
    return hits
}

function tierMarkerNearby(body: string, callsiteLineIdx: number): boolean {
    const lines = body.split('\n')
    const start = Math.max(0, callsiteLineIdx - TIER_LOOKBACK_LINES)
    for (let i = start; i < callsiteLineIdx; i++) {
        if (TIER_RE.test(lines[i] ?? '')) return true
    }
    return false
}

describe('Memory Tier — every muninn_remember callsite has a tier marker within 30 lines preceding', () => {
    const files = gatherCandidateFiles()

    test('walker found scan-root files', () => {
        expect(files.length).toBeGreaterThan(10)
    })

    for (const file of files) {
        const rel = path.relative(PKG_ROOT, file)
        const body = readFileSync(file, 'utf8')
        const callsites = findRememberCallsites(body)
        if (callsites.length === 0) continue

        for (const { lineIdx, line } of callsites) {
            const lineNo = lineIdx + 1
            test(`${rel}:${lineNo} ${line.trim().slice(0, 60)}`, () => {
                expect(
                    tierMarkerNearby(body, lineIdx),
                    `Expected 'Tier: verified|inferred|external|untrusted' within ${TIER_LOOKBACK_LINES} lines preceding ${rel}:${lineNo}`,
                ).toBe(true)
            })
        }
    }
})
