import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
    deriveSlug,
    parseTicketId,
    phaseDir,
    phasePath,
    planningRoot,
    resolveAvailableSlug,
    slugifySegment,
} from './phase-paths.js'

let tmpRoot: string
let originalCwd: string

beforeEach(() => {
    originalCwd = process.cwd()
    tmpRoot = mkdtempSync(join(tmpdir(), 'phase-paths-'))
    process.chdir(tmpRoot)
})

afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(tmpRoot)) {
        rmSync(tmpRoot, { recursive: true, force: true })
    }
})

describe('slugifySegment', () => {
    test("'My Cool App!' → 'my-cool-app'", () => {
        expect(slugifySegment('My Cool App!')).toBe('my-cool-app')
    })

    test("'@scope/pkg' → 'scope-pkg'", () => {
        expect(slugifySegment('@scope/pkg')).toBe('scope-pkg')
    })

    test("'---trim---' → 'trim'", () => {
        expect(slugifySegment('---trim---')).toBe('trim')
    })

    test("'' → ''", () => {
        expect(slugifySegment('')).toBe('')
    })
})

describe('parseTicketId', () => {
    test("'PT-11089 order book loading flash' → 'PT-11089'", () => {
        expect(parseTicketId('PT-11089 order book loading flash')).toBe(
            'PT-11089'
        )
    })

    test("'add a new feature' → null", () => {
        expect(parseTicketId('add a new feature')).toBeNull()
    })

    test("'JIRA-1 and PT-2' → 'JIRA-1' (first match)", () => {
        expect(parseTicketId('JIRA-1 and PT-2')).toBe('JIRA-1')
    })
})

describe('deriveSlug', () => {
    test("ticket-id intent: starts with 'PT-220-' and contains 'refactor'", () => {
        const slug = deriveSlug('PT-220 refactor planning')
        expect(slug.startsWith('PT-220-')).toBe(true)
        expect(slug).toContain('refactor')
    })

    test('no-ticket intent uses local-time YYYYMMDD-HHmm prefix', () => {
        const slug = deriveSlug('add darkmode toggle', {
            now: new Date('2026-05-05T17:23:00'),
        })
        expect(slug).toMatch(/^20260505-\d{4}-add-darkmode-toggle$/)
    })

    test('always returns a non-empty slug, even for purely punctuation intent', () => {
        const slug = deriveSlug('!!!', { now: new Date('2026-05-05T17:23:00') })
        expect(slug.length).toBeGreaterThan(0)
        expect(slug).toMatch(/^20260505-\d{4}-legacy$/)
    })
})

describe('phaseDir', () => {
    test('phaseDir(undefined) === planningRoot()', () => {
        expect(phaseDir(undefined)).toBe(planningRoot())
    })

    test("phaseDir('') === planningRoot()", () => {
        expect(phaseDir('')).toBe(planningRoot())
    })

    test("phaseDir('foo') === <planningRoot>/phases/foo", () => {
        expect(phaseDir('foo')).toBe(join(planningRoot(), 'phases', 'foo'))
    })
})

describe('phasePath', () => {
    test('ensures the phase dir exists and returns the file path; idempotent on re-call', () => {
        const first = phasePath('PLAN.md', 'foo')
        expect(first).toBe(join(planningRoot(), 'phases', 'foo', 'PLAN.md'))
        expect(existsSync(join(planningRoot(), 'phases', 'foo'))).toBe(true)

        // Second call must not throw and must return the same path.
        const second = phasePath('PLAN.md', 'foo')
        expect(second).toBe(first)
    })

    test("rejects '..' parent-traversal filenames", () => {
        expect(() => phasePath('../etc', 'foo')).toThrow(
            'phasePath filename must be a non-empty bare filename'
        )
    })

    test("rejects filenames containing '/'", () => {
        expect(() => phasePath('a/b', 'foo')).toThrow(
            'phasePath filename must be a non-empty bare filename'
        )
    })

    test("rejects filenames containing '\\'", () => {
        expect(() => phasePath('a\\b', 'foo')).toThrow(
            'phasePath filename must be a non-empty bare filename'
        )
    })
})

describe('resolveAvailableSlug', () => {
    test('returns base slug when phases/<slug> is absent', () => {
        expect(resolveAvailableSlug('alpha')).toBe('alpha')
    })

    test('returns base slug when phases/<slug> exists but is empty (re-entry)', () => {
        mkdirSync(join(planningRoot(), 'phases', 'alpha'), { recursive: true })
        expect(resolveAvailableSlug('alpha')).toBe('alpha')
    })

    test('appends -2 when phases/<slug> exists with content', () => {
        const occupied = join(planningRoot(), 'phases', 'alpha')
        mkdirSync(occupied, { recursive: true })
        writeFileSync(join(occupied, 'PLAN.md'), '# stub\n')

        expect(resolveAvailableSlug('alpha')).toBe('alpha-2')
    })

    test('chains -3 when -2 is also occupied', () => {
        for (const name of ['alpha', 'alpha-2']) {
            const dir = join(planningRoot(), 'phases', name)
            mkdirSync(dir, { recursive: true })
            writeFileSync(join(dir, 'PLAN.md'), '# stub\n')
        }
        expect(resolveAvailableSlug('alpha')).toBe('alpha-3')
        // The chosen dir is mkdir'd as a belt-and-suspenders claim.
        expect(existsSync(join(planningRoot(), 'phases', 'alpha-3'))).toBe(true)
        // Sanity: claim is empty (not polluting upstream content checks).
        expect(readdirSync(join(planningRoot(), 'phases', 'alpha-3'))).toEqual(
            []
        )
    })
})
