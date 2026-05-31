import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
    extractClaims,
    verifyClaims,
    verifyFile,
    verifyTextArtifact,
} from './claim-verifier.ts'

const tmpDirs: string[] = []

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-claim-'))
    tmpDirs.push(dir)
    return dir
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('extractClaims', () => {
    test('returns [] for empty input', () => {
        expect(extractClaims('')).toEqual([])
    })

    test('extracts a backtick-wrapped symbol', () => {
        const claims = extractClaims('We added `processWidget` today.')
        expect(claims).toHaveLength(1)
        expect(claims[0]?.type).toBe('symbol')
        expect(claims[0]?.identifier).toBe('processWidget')
        expect(claims[0]?.sourceLine).toBe(1)
    })

    test('skips stopwords and sub-3-char identifiers', () => {
        expect(extractClaims('`git` `npm` `tsc` `ab`')).toEqual([])
    })

    test('skips file-path-shaped backticks (not symbols)', () => {
        const claims = extractClaims('See `src/foo.ts` for details.')
        expect(claims.every((c) => c.type !== 'symbol')).toBe(true)
    })

    test('extracts repo-relative file paths', () => {
        const claims = extractClaims('Edited src/foo.ts and packages/x/y.ts.')
        const paths = claims
            .filter((c) => c.type === 'file-path')
            .map((c) => c.path)
        expect(paths).toContain('src/foo.ts')
        expect(paths).toContain('packages/x/y.ts')
    })

    test('extracts quantitative claims with countable nouns', () => {
        const claims = extractClaims('This PR touches 5 files.')
        const q = claims.find((c) => c.type === 'quantitative')
        expect(q?.number).toBe(5)
        expect(q?.noun).toBe('file')
    })

    test('ignores non-countable nouns', () => {
        expect(
            extractClaims('We waited 5 minutes.').filter(
                (c) => c.type === 'quantitative'
            )
        ).toEqual([])
    })

    test('ignores 4-digit years', () => {
        expect(
            extractClaims('In 2026 commits landed.').filter(
                (c) => c.type === 'quantitative'
            )
        ).toEqual([])
    })

    test('deduplicates a symbol cited multiple times', () => {
        const claims = extractClaims('`processWidget` then `processWidget`.')
        expect(claims.filter((c) => c.identifier === 'processWidget')).toHaveLength(
            1
        )
    })
})

describe('verifyClaims + verifyTextArtifact', () => {
    test('passes a symbol that exists in the repo, fails one that does not', () => {
        const repo = cleanDir()
        writeFileSync(
            join(repo, 'mod.ts'),
            'export function knownSymbol() { return 1 }'
        )
        const report = verifyClaims(
            extractClaims('Added `knownSymbol`, removed `missingSymbol`.'),
            { repoRoot: repo }
        )
        expect(report.passed).toBe(false)
        expect(
            report.failures.some(
                (f) =>
                    f.reason === 'symbol-not-found' &&
                    f.claim.identifier === 'missingSymbol'
            )
        ).toBe(true)
        expect(
            report.failures.some((f) => f.claim.identifier === 'knownSymbol')
        ).toBe(false)
    })

    test('flags a missing file path, accepts an existing one', () => {
        const repo = cleanDir()
        mkdirSync(join(repo, 'src'), { recursive: true })
        writeFileSync(join(repo, 'src', 'here.ts'), 'content')
        const report = verifyClaims(
            extractClaims('See src/here.ts and src/gone.ts.'),
            { repoRoot: repo }
        )
        expect(
            report.failures.some(
                (f) =>
                    f.reason === 'file-not-found' &&
                    f.claim.path === 'src/gone.ts'
            )
        ).toBe(true)
        expect(
            report.failures.some((f) => f.claim.path === 'src/here.ts')
        ).toBe(false)
    })

    test('flags a quantitative count mismatch', () => {
        const repo = cleanDir()
        writeFileSync(join(repo, 'empty.md'), 'nothing countable here')
        const report = verifyTextArtifact('This PR touches 5 files.', {
            repoRoot: repo,
        })
        expect(
            report.failures.some((f) => f.reason === 'count-mismatch')
        ).toBe(true)
    })

    test('reports an all-pass artifact and the extracted breakdown', () => {
        const repo = cleanDir()
        writeFileSync(join(repo, 'a.ts'), 'symbolOne and symbolTwo live here')
        const report = verifyTextArtifact(
            '`symbolOne` and `symbolTwo` both exist.',
            { repoRoot: repo }
        )
        expect(report.passed).toBe(true)
        expect(report.totalClaims).toBe(2)
        expect(report.extractedBreakdown.symbols).toBe(2)
    })
})

describe('verifyFile', () => {
    test('returns an artifact-unreadable failure for a missing file', () => {
        const report = verifyFile(join(cleanDir(), 'nope.md'), {
            repoRoot: cleanDir(),
        })
        expect(report.passed).toBe(false)
        expect(report.failures[0]?.reason).toBe('artifact-unreadable')
    })

    test('verifies the claims inside a readable file', () => {
        const repo = cleanDir()
        writeFileSync(join(repo, 'code.ts'), 'export const realThing = 1')
        const artifact = join(repo, 'CHANGES.md')
        writeFileSync(artifact, 'Renamed to `realThing`.')
        const report = verifyFile(artifact, { repoRoot: repo })
        expect(report.passed).toBe(true)
    })
})
