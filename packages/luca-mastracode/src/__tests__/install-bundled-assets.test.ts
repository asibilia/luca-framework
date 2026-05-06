import {
    mkdtempSync,
    rmSync,
    existsSync,
    lstatSync,
    readdirSync,
    readlinkSync,
    writeFileSync,
    mkdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import {
    installSkills,
    installSlashCommands,
} from '../integration/install-bundled-assets.js'
import { loadAlwaysApplyRules } from '../rules-loader.js'

// The bundled asset dirs live at the package root (one level above src/).
// Pass this as assetsRoot so the install fns find them when running from
// the source tree (where import.meta.url would resolve to src/integration/).
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

let tmpRoot: string
let originalCwd: string

beforeEach(() => {
    originalCwd = process.cwd()
    tmpRoot = mkdtempSync(join(tmpdir(), 'luca-install-test-'))
    process.chdir(tmpRoot)
})

afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(tmpRoot)) {
        rmSync(tmpRoot, { recursive: true, force: true })
    }
})

describe('installSlashCommands (symlink)', () => {
    test('creates a symlink at .mastracode/commands pointing at bundled dir', () => {
        installSlashCommands(PACKAGE_ROOT)
        const targetPath = join(tmpRoot, '.mastracode', 'commands')

        expect(existsSync(targetPath)).toBe(true)
        const stat = lstatSync(targetPath)
        expect(stat.isSymbolicLink()).toBe(true)

        const linkedTo = readlinkSync(targetPath)
        expect(linkedTo).toBe(join(PACKAGE_ROOT, 'commands'))

        // Symlink resolves to a non-empty bundled dir
        expect(readdirSync(targetPath).length).toBeGreaterThan(0)
    })

    test('is idempotent — second call leaves existing symlink in place', () => {
        installSlashCommands(PACKAGE_ROOT)
        const targetPath = join(tmpRoot, '.mastracode', 'commands')
        const linkBefore = readlinkSync(targetPath)

        expect(() => installSlashCommands(PACKAGE_ROOT)).not.toThrow()

        const linkAfter = readlinkSync(targetPath)
        expect(linkAfter).toBe(linkBefore)
    })

    test('leaves an existing real directory untouched (safe for user content)', () => {
        // Simulate either a legacy install OR an intentional user override:
        // a real directory with files. We can't tell them apart, so we
        // must not auto-replace.
        const targetPath = join(tmpRoot, '.mastracode', 'commands')
        mkdirSync(targetPath, { recursive: true })
        writeFileSync(join(targetPath, 'user-custom.md'), 'user content')
        expect(lstatSync(targetPath).isDirectory()).toBe(true)
        expect(lstatSync(targetPath).isSymbolicLink()).toBe(false)

        installSlashCommands(PACKAGE_ROOT)

        // Still a real directory, user file preserved, no symlink created.
        expect(lstatSync(targetPath).isSymbolicLink()).toBe(false)
        expect(lstatSync(targetPath).isDirectory()).toBe(true)
        expect(existsSync(join(targetPath, 'user-custom.md'))).toBe(true)
    })
})

describe('installSkills (symlink)', () => {
    test('creates a symlink at .mastracode/skills pointing at bundled dir', () => {
        installSkills(PACKAGE_ROOT)
        const targetPath = join(tmpRoot, '.mastracode', 'skills')

        expect(existsSync(targetPath)).toBe(true)
        const stat = lstatSync(targetPath)
        expect(stat.isSymbolicLink()).toBe(true)

        const linkedTo = readlinkSync(targetPath)
        expect(linkedTo).toBe(join(PACKAGE_ROOT, 'skills'))

        expect(readdirSync(targetPath).length).toBeGreaterThan(0)
    })

    test('is idempotent — second call leaves existing symlink in place', () => {
        installSkills(PACKAGE_ROOT)
        expect(() => installSkills(PACKAGE_ROOT)).not.toThrow()
    })
})

describe('loadAlwaysApplyRules (bundled fallback)', () => {
    test('reads from bundled <pkg>/rules/ when .mastracode/rules/ does not exist', () => {
        const targetDir = join(tmpRoot, '.mastracode', 'rules')
        expect(existsSync(targetDir)).toBe(false)

        const rules = loadAlwaysApplyRules()
        expect(rules.length).toBeGreaterThan(0)
    })
})

describe('zero-footprint invariant', () => {
    test('after install, .mastracode/ contains only 2 symlinks (no copied files)', () => {
        installSlashCommands(PACKAGE_ROOT)
        installSkills(PACKAGE_ROOT)

        const mastracodeDir = join(tmpRoot, '.mastracode')
        const entries = readdirSync(mastracodeDir)

        expect(entries.sort()).toEqual(['commands', 'skills'])

        // Both must be symlinks, not real directories
        for (const entry of entries) {
            const stat = lstatSync(join(mastracodeDir, entry))
            expect(stat.isSymbolicLink()).toBe(true)
        }
    })
})
