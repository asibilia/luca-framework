import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

import { addTodo, listTodos, moveBatch, assignBatch } from '../state/todos.js'

let tmpRoot: string
let originalCwd: string

beforeEach(() => {
    originalCwd = process.cwd()
    tmpRoot = mkdtempSync(join(tmpdir(), 'luca-todos-test-'))
    process.chdir(tmpRoot)
})

afterEach(() => {
    process.chdir(originalCwd)
    if (existsSync(tmpRoot)) {
        rmSync(tmpRoot, { recursive: true, force: true })
    }
})

function seedTodos(titles: string[]) {
    for (const title of titles) {
        addTodo({ title, source: 'test' })
    }
}

describe('moveBatch', () => {
    test('moves multiple todos to done in a single index-stable pass', () => {
        seedTodos(['Alpha task', 'Bravo task', 'Charlie task', 'Delta task'])

        const before = listTodos()
        expect(before.map((t) => t.index)).toEqual([1, 2, 3, 4])
        expect(before.every((t) => t.status === 'pending')).toBe(true)

        // Move three of the four to done by their original indices.
        // If indices shifted between moves, the wrong todos would be picked.
        const result = moveBatch({
            items: [
                { identifier: 1, targetStatus: 'done' },
                { identifier: 2, targetStatus: 'done' },
                { identifier: 3, targetStatus: 'done' },
            ],
        })

        expect(result.missing).toEqual([])
        expect(result.moved).toHaveLength(3)
        expect(result.moved.map((t) => t.title).sort()).toEqual([
            'Alpha task',
            'Bravo task',
            'Charlie task',
        ])
        expect(result.moved.every((t) => t.status === 'done')).toBe(true)

        const after = listTodos()
        const pending = after.filter((t) => t.status === 'pending')
        const done = after.filter((t) => t.status === 'done')
        expect(pending.map((t) => t.title)).toEqual(['Delta task'])
        expect(done.map((t) => t.title).sort()).toEqual([
            'Alpha task',
            'Bravo task',
            'Charlie task',
        ])
    })

    test('supports mixed numeric and slug identifiers', () => {
        seedTodos(['First task', 'Second task', 'Third task'])

        const result = moveBatch({
            items: [
                { identifier: 1, targetStatus: 'backlog' },
                { identifier: 'second-task', targetStatus: 'done' },
            ],
        })

        expect(result.missing).toEqual([])
        expect(result.moved).toHaveLength(2)

        const after = listTodos()
        const byTitle = Object.fromEntries(
            after.map((t) => [t.title, t.status])
        )
        expect(byTitle['First task']).toBe('backlog')
        expect(byTitle['Second task']).toBe('done')
        expect(byTitle['Third task']).toBe('pending')
    })

    test('returns missing identifiers without aborting the batch', () => {
        seedTodos(['Real task'])

        const result = moveBatch({
            items: [
                { identifier: 1, targetStatus: 'done' },
                { identifier: 999, targetStatus: 'done' },
                { identifier: 'no-such-slug', targetStatus: 'done' },
            ],
        })

        expect(result.moved).toHaveLength(1)
        const [only] = result.moved
        if (!only) throw new Error('expected one moved todo')
        expect(only.title).toBe('Real task')
        expect(result.missing).toEqual([999, 'no-such-slug'])
    })

    test('treats already-in-target-status as a no-op success', () => {
        seedTodos(['Already done'])
        // First move it to done.
        moveBatch({ items: [{ identifier: 1, targetStatus: 'done' }] })

        const after = listTodos()
        const target = after.find((t) => t.title === 'Already done')
        if (!target) throw new Error('seeded todo missing')
        expect(target.status).toBe('done')

        // Re-issuing the same move should not error and should not duplicate.
        const result = moveBatch({
            items: [{ identifier: target.index, targetStatus: 'done' }],
        })
        expect(result.missing).toEqual([])
        expect(result.moved).toHaveLength(1)
        const [first] = result.moved
        if (!first) throw new Error('expected one moved todo')
        expect(first.status).toBe('done')

        // Filesystem only has one copy.
        const doneDir = join(tmpRoot, '.planning', 'todos', 'done')
        const files = readdirSync(doneDir).filter((f) => f.endsWith('.md'))
        expect(files).toHaveLength(1)
    })

    test('handles duplicate identifiers without ENOENT on rename', () => {
        seedTodos(['Solo task'])

        // Two references to the same todo (by index and slug) in one batch.
        // Naive impl would renameSync the already-moved path twice.
        const result = moveBatch({
            items: [
                { identifier: 1, targetStatus: 'done' },
                { identifier: 'solo-task', targetStatus: 'done' },
            ],
        })

        expect(result.missing).toEqual([])
        expect(result.moved).toHaveLength(2)
        expect(result.moved.every((t) => t.status === 'done')).toBe(true)

        // Filesystem still only has one copy.
        const doneDir = join(tmpRoot, '.planning', 'todos', 'done')
        const files = readdirSync(doneDir).filter((f) => f.endsWith('.md'))
        expect(files).toHaveLength(1)
    })

    test('handles same-identifier-different-target by replaying moves', () => {
        seedTodos(['Indecisive task'])

        // pending → done → backlog in one batch. Both moves should succeed.
        const result = moveBatch({
            items: [
                { identifier: 1, targetStatus: 'done' },
                { identifier: 'indecisive-task', targetStatus: 'backlog' },
            ],
        })

        expect(result.missing).toEqual([])
        expect(result.moved).toHaveLength(2)
        expect(result.moved.at(-1)?.status).toBe('backlog')

        const after = listTodos()
        const target = after.find((t) => t.slug === 'indecisive-task')
        expect(target?.status).toBe('backlog')
    })

    test('handles empty items array gracefully', () => {
        seedTodos(['Solo'])
        const result = moveBatch({ items: [] })
        expect(result.moved).toEqual([])
        expect(result.missing).toEqual([])
    })
})

describe('assignBatch', () => {
    test('moves backlog items to pending using a stable snapshot', () => {
        // Seed everything, then push two to backlog so they get later indices.
        seedTodos(['Pending one', 'Will move 1', 'Will move 2'])
        moveBatch({
            items: [
                { identifier: 'will-move-1', targetStatus: 'backlog' },
                { identifier: 'will-move-2', targetStatus: 'backlog' },
            ],
        })

        const before = listTodos()
        const willMove1 = before.find((t) => t.slug === 'will-move-1')
        const willMove2 = before.find((t) => t.slug === 'will-move-2')
        if (!willMove1 || !willMove2)
            throw new Error('seeded backlog todos missing')

        // Assign both back to pending using their current indices.
        // If indices shift mid-batch, the second index would point at the wrong row.
        const assigned = assignBatch({
            indices: [willMove1.index, willMove2.index],
        })

        expect(assigned).toHaveLength(2)
        expect(assigned.map((t) => t.title).sort()).toEqual([
            'Will move 1',
            'Will move 2',
        ])
        expect(assigned.every((t) => t.status === 'pending')).toBe(true)
    })
})
