import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'bun:test'

import { computePhaseDiff, snapshotWorkingTree } from './phase-diff.ts'

const tmpDirs: string[] = []

function cleanDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'luca-phasediff-'))
    tmpDirs.push(dir)
    return dir
}

function gitIn(dir: string, ...args: string[]): void {
    spawnSync('git', args, { cwd: dir })
}

/** Create a temp git repo with one committed file. */
function makeGitRepo(): string {
    const dir = cleanDir()
    gitIn(dir, 'init', '-q')
    gitIn(dir, 'config', 'user.email', 'test@example.com')
    gitIn(dir, 'config', 'user.name', 'Test')
    writeFileSync(join(dir, 'a.txt'), 'one')
    gitIn(dir, 'add', '.')
    gitIn(dir, 'commit', '-q', '-m', 'initial')
    return dir
}

afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('snapshotWorkingTree', () => {
    test('reports gitAvailable false for a non-git directory', () => {
        const snap = snapshotWorkingTree('execute', cleanDir())
        expect(snap.gitAvailable).toBe(false)
        expect(snap.headSha).toBeNull()
    })

    test('captures HEAD and gitAvailable true for a git repo', () => {
        const snap = snapshotWorkingTree('execute', makeGitRepo())
        expect(snap.gitAvailable).toBe(true)
        expect(snap.headSha).toMatch(/^[0-9a-f]{40}$/)
        expect(snap.phase).toBe('execute')
    })
})

describe('computePhaseDiff', () => {
    test('is indeterminate when there is no snapshot', () => {
        const diff = computePhaseDiff(null, cleanDir())
        expect(diff.indeterminate).toBe(true)
        expect(diff.isEmpty).toBe(false)
    })

    test('is indeterminate for a non-git snapshot', () => {
        const dir = cleanDir()
        const snap = snapshotWorkingTree('execute', dir)
        expect(computePhaseDiff(snap, dir).indeterminate).toBe(true)
    })

    test('flags an unchanged phase as empty', () => {
        const dir = makeGitRepo()
        const diff = computePhaseDiff(snapshotWorkingTree('execute', dir), dir)
        expect(diff.isEmpty).toBe(true)
        expect(diff.indeterminate).toBe(false)
    })

    test('detects a new file as real work', () => {
        const dir = makeGitRepo()
        const snap = snapshotWorkingTree('execute', dir)
        writeFileSync(join(dir, 'b.txt'), 'two')
        const diff = computePhaseDiff(snap, dir)
        expect(diff.filesChanged).toContain('b.txt')
        expect(diff.isEmpty).toBe(false)
    })

    test('detects an added commit as real work', () => {
        const dir = makeGitRepo()
        const snap = snapshotWorkingTree('execute', dir)
        writeFileSync(join(dir, 'c.txt'), 'three')
        gitIn(dir, 'add', '.')
        gitIn(dir, 'commit', '-q', '-m', 'phase work')
        const diff = computePhaseDiff(snap, dir)
        expect(diff.commitsAdded.length).toBe(1)
        expect(diff.isEmpty).toBe(false)
    })

    test('is indeterminate when the tree was already dirty at snapshot', () => {
        const dir = makeGitRepo()
        writeFileSync(join(dir, 'a.txt'), 'modified before the phase')
        const snap = snapshotWorkingTree('execute', dir)
        expect(snap.dirtyFiles).toContain('a.txt')
        const diff = computePhaseDiff(snap, dir)
        expect(diff.indeterminate).toBe(true)
        expect(diff.isEmpty).toBe(false)
    })
})
