import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { pathText } from './path-text'

let root = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-engine-path-text-'))
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('pathText', () => {
    test("a file's text", async () => {
        await Bun.write(join(root, 'a.ts'), 'export const a = 1\n')

        expect(await pathText({ path: join(root, 'a.ts') })).toBe(
            'export const a = 1\n'
        )
    })

    test('a symlink to a folder is its target, as git stores it, and never a crash', async () => {
        const tools = join(root, 'vendor', 'bin')
        await mkdir(tools, { recursive: true })
        await symlink(tools, join(root, 'bin'))

        expect(await pathText({ path: join(root, 'bin') })).toBe(tools)
    })

    test('a symlink to a file is its target, never the file it points at', async () => {
        await Bun.write(join(root, 'real.txt'), 'secret')
        await symlink(join(root, 'real.txt'), join(root, 'link.txt'))

        expect(await pathText({ path: join(root, 'link.txt') })).toBe(
            join(root, 'real.txt')
        )
    })

    test('a dangling symlink is still its target', async () => {
        await symlink(join(root, 'gone'), join(root, 'dangling'))

        expect(await pathText({ path: join(root, 'dangling') })).toBe(
            join(root, 'gone')
        )
    })

    test('a folder, or nothing there, has no text', async () => {
        await mkdir(join(root, 'folder'))

        expect(await pathText({ path: join(root, 'folder') })).toBeNull()
        expect(await pathText({ path: join(root, 'missing') })).toBeNull()
    })
})
