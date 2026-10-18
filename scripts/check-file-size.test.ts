import { describe, expect, test } from 'bun:test'

import {
    FILE_SIZE_LIMIT_TOKENS,
    IGNORED_FILES,
    fileKind,
    filesOverLimit,
    formatFailure,
    isIgnoredPath,
    looksBinary,
    tokenCount,
} from './check-file-size'

describe('tokenCount', () => {
    test('counts bytes / 4, rounded up', () => {
        expect(tokenCount({ bytes: 0 })).toBe(0)
        expect(tokenCount({ bytes: 1 })).toBe(1)
        expect(tokenCount({ bytes: 4 })).toBe(1)
        expect(tokenCount({ bytes: 5 })).toBe(2)
    })

    test('a file of exactly 20,000 bytes is at the limit, 20,001 is over', () => {
        expect(FILE_SIZE_LIMIT_TOKENS).toBe(5000)
        expect(tokenCount({ bytes: 20000 })).toBe(5000)
        expect(tokenCount({ bytes: 20001 })).toBe(5001)
        const over = filesOverLimit({
            files: [
                { path: 'at-limit.ts', bytes: 20000 },
                { path: 'over-limit.ts', bytes: 20001 },
            ],
        })
        expect(over).toEqual([{ path: 'over-limit.ts', tokens: 5001 }])
    })
})

describe('isIgnoredPath', () => {
    test('skips lockfiles, changelogs, changesets and generated files', () => {
        expect(isIgnoredPath({ path: 'bun.lock' })).toBe(true)
        expect(isIgnoredPath({ path: 'CHANGELOG.md' })).toBe(true)
        expect(isIgnoredPath({ path: 'packages/engine/CHANGELOG.md' })).toBe(
            true
        )
        expect(isIgnoredPath({ path: '.changeset/brave-owls-sing.md' })).toBe(
            true
        )
        expect(
            isIgnoredPath({ path: 'packages/engine/src/doctor/v13-files.json' })
        ).toBe(true)
    })

    test('does not skip agent-authored files with similar names', () => {
        expect(isIgnoredPath({ path: 'docs/changelog-guide.md' })).toBe(false)
        expect(isIgnoredPath({ path: 'src/changeset/notes.ts' })).toBe(false)
        expect(
            isIgnoredPath({ path: 'packages/engine/src/doctor/x.json' })
        ).toBe(false)
        expect(isIgnoredPath({ path: 'scripts/check-file-size.ts' })).toBe(
            false
        )
    })

    test('every ignore entry gives a one-line reason', () => {
        expect(IGNORED_FILES.length).toBeGreaterThan(0)
        for (const entry of IGNORED_FILES) {
            expect(entry.reason.length).toBeGreaterThan(0)
            expect(entry.reason).not.toContain('\n')
        }
    })
})

describe('looksBinary', () => {
    test('a NUL byte in the first 8,000 bytes means binary, as in git', () => {
        expect(looksBinary({ bytes: new Uint8Array([104, 105, 0, 33]) })).toBe(
            true
        )
        expect(looksBinary({ bytes: new TextEncoder().encode('hello') })).toBe(
            false
        )
        const late = new Uint8Array(9000)
        late.fill(97)
        late[8500] = 0
        expect(looksBinary({ bytes: late })).toBe(false)
    })
})

describe('fileKind', () => {
    test('sorts a path into source, test, markdown or other', () => {
        expect(fileKind({ path: 'src/a.ts' })).toBe('source')
        expect(fileKind({ path: 'src/a.tsx' })).toBe('source')
        expect(fileKind({ path: 'bin/a.js' })).toBe('source')
        expect(fileKind({ path: 'src/a.test.ts' })).toBe('test')
        expect(fileKind({ path: 'src/a.e2e.test.ts' })).toBe('test')
        expect(fileKind({ path: 'docs/a.md' })).toBe('markdown')
        expect(fileKind({ path: 'data/a.json' })).toBe('other')
    })
})

describe('formatFailure', () => {
    test('is quiet when nothing fails', () => {
        expect(formatFailure({ failures: [] })).toBe('')
    })

    test('lists each file with its token count and the limit', () => {
        const message = formatFailure({
            failures: [{ path: 'src/big.ts', tokens: 6200 }],
        })
        expect(message).toContain('src/big.ts')
        expect(message).toContain('6,200 tokens')
        expect(message).toContain('5,000')
    })

    test('gives source instructions for source files', () => {
        const message = formatFailure({
            failures: [{ path: 'src/big.ts', tokens: 6200 }],
        })
        expect(message).toContain('by responsibility')
        expect(message).toContain('kebab-case')
        expect(message).toContain('re-export')
        expect(message).toContain('no behaviour change')
        expect(message).not.toContain('docs/feature-map.md')
    })

    test('gives test instructions that name the feature map', () => {
        const message = formatFailure({
            failures: [{ path: 'src/big.e2e.test.ts', tokens: 6200 }],
        })
        expect(message).toContain('describe')
        expect(message).toContain('<name>-<topic>.test.ts')
        expect(message).toContain('.e2e.test.ts')
        expect(message).toContain('docs/feature-map.md')
        expect(message).toContain('test count must stay the same')
        expect(message).not.toContain('by responsibility')
    })

    test('gives markdown and other instructions', () => {
        const message = formatFailure({
            failures: [
                { path: 'docs/big.md', tokens: 7000 },
                { path: 'data/big.json', tokens: 7000 },
            ],
        })
        expect(message).toContain('by section')
        expect(message).toContain('index')
        expect(message).toContain('Fix the links')
        expect(message).toContain('by topic')
    })

    test('ends with how tokens are counted and what is skipped', () => {
        const message = formatFailure({
            failures: [{ path: 'src/big.ts', tokens: 6200 }],
        })
        expect(
            message
                .trimEnd()
                .endsWith(
                    'Tokens are counted as bytes / 4. Lockfiles, changelogs, changesets and generated files are skipped.'
                )
        ).toBe(true)
    })
})
