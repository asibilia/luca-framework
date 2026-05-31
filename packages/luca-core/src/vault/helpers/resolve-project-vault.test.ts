import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { resolveProjectVault } from './resolve-project-vault.ts'

const tmpDirs: string[] = []

/** Create a temp project dir; optionally seed `.luca/config.json` with `content`. */
function makeProject(content?: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-vault-test-'))
    tmpDirs.push(dir)
    if (content !== undefined) {
        mkdirSync(join(dir, '.luca'), { recursive: true })
        writeFileSync(join(dir, '.luca', 'config.json'), content)
    }
    return dir
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('resolveProjectVault', () => {
    test('reads and sanitizes muninn.vault from .luca/config.json', () => {
        const dir = makeProject(
            JSON.stringify({ muninn: { vault: 'My Project' } })
        )
        expect(resolveProjectVault(dir)).toBe('my-project')
    })

    test('returns the vault verbatim when it is already a valid slug', () => {
        const dir = makeProject(
            JSON.stringify({ muninn: { vault: 'luca-framework' } })
        )
        expect(resolveProjectVault(dir)).toBe('luca-framework')
    })

    test('falls back to "default" when config.json is absent', () => {
        expect(resolveProjectVault(makeProject())).toBe('default')
    })

    test('falls back to "default" when muninn.vault is unset', () => {
        const dir = makeProject(JSON.stringify({ oversight: 'full-auto' }))
        expect(resolveProjectVault(dir)).toBe('default')
    })

    test('falls back to "default" on malformed JSON', () => {
        expect(resolveProjectVault(makeProject('{ not valid json'))).toBe(
            'default'
        )
    })
})
