/**
 * Memory Tier Verified-Followup — Pattern 1 (narrow).
 *
 * For every `Tier: verified` marker in instruction prose, asserts a
 * `mcp__muninn__muninn_trust(...)` call appears within 50 lines following.
 *
 * 50-line window chosen to accommodate intro sentence + fenced follow-up
 * block + idempotency note across markdown structure variation.
 *
 * Excludes:
 *   - src/__tests__/
 *   - src/memory-tier-discipline.ts (the rule body itself mentions trust)
 *   - dist/
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

const VERIFIED_RE = /Tier:\s*verified/
const TRUST_RE = /mcp__muninn__muninn_trust\s*\(/

const TRUST_LOOKAHEAD_LINES = 50

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

function findVerifiedMarkers(body: string): number[] {
    const lines = body.split('\n')
    const out: number[] = []
    for (let i = 0; i < lines.length; i++) {
        if (VERIFIED_RE.test(lines[i] ?? '')) out.push(i)
    }
    return out
}

function trustFollowupNearby(body: string, markerLineIdx: number): boolean {
    const lines = body.split('\n')
    const end = Math.min(
        lines.length,
        markerLineIdx + 1 + TRUST_LOOKAHEAD_LINES,
    )
    for (let i = markerLineIdx + 1; i < end; i++) {
        if (TRUST_RE.test(lines[i] ?? '')) return true
    }
    return false
}

describe('Memory Tier — every Tier: verified marker has muninn_trust follow-up within 50 lines', () => {
    const files = gatherCandidateFiles()

    let totalVerified = 0
    for (const file of files) {
        const rel = path.relative(PKG_ROOT, file)
        const body = readFileSync(file, 'utf8')
        const markers = findVerifiedMarkers(body)
        totalVerified += markers.length
        for (const lineIdx of markers) {
            const lineNo = lineIdx + 1
            test(`${rel}:${lineNo} verified-marker has trust follow-up`, () => {
                expect(
                    trustFollowupNearby(body, lineIdx),
                    `Expected 'mcp__muninn__muninn_trust(' within ${TRUST_LOOKAHEAD_LINES} lines following Tier: verified marker at ${rel}:${lineNo}`,
                ).toBe(true)
            })
        }
    }

    test('repo contains the expected number of verified-tier markers (sanity check)', () => {
        // Six verified callsites: W1 milestone-new, W3 repo-cleanup,
        // W6 + W7 arch-audit (×2), W8 luca-init, plus the tools/project-preferences
        // description string instructing the verified follow-up. If a future
        // change adds or removes one, update this floor accordingly.
        expect(totalVerified).toBeGreaterThanOrEqual(5)
        expect(totalVerified).toBeLessThanOrEqual(10)
    })
})
