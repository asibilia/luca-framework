import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { outsideLinks } from './outside-links'

/**
 * Links that point outside a checkout (#496), such as a build's link to a
 * vendor folder in the owner's own checkout, never belong in a commit.
 */

let root = ''
let cwd = ''

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'luca-outside-links-'))
    cwd = join(root, 'checkout')
    await mkdir(join(cwd, 'tools'), { recursive: true })
    await Bun.write(join(cwd, 'src', 'sum.ts'), 'export {}\n')
})

afterEach(async () => {
    await rm(root, { recursive: true, force: true })
})

describe('outsideLinks', () => {
    test('finds links whose target is outside the checkout, absolute or relative', async () => {
        await symlink(join(root, 'vendor'), join(cwd, 'tools', 'bin'))
        await symlink('../../vendor/mwccarm', join(cwd, 'tools', 'mwccarm'))

        expect(
            await outsideLinks({ cwd, paths: ['tools/bin', 'tools/mwccarm'] })
        ).toEqual(['tools/bin', 'tools/mwccarm'])
    })

    test('a link inside the checkout, a plain file, and a missing path are not outside links', async () => {
        await symlink('../src/sum.ts', join(cwd, 'tools', 'sum'))
        await symlink(join(cwd, 'src'), join(cwd, 'tools', 'src'))

        expect(
            await outsideLinks({
                cwd,
                paths: ['tools/sum', 'tools/src', 'src/sum.ts', 'gone.txt'],
            })
        ).toEqual([])
    })

    test('a link to a sibling whose name starts like the checkout is outside', async () => {
        await mkdir(join(root, 'checkout-other'))
        await symlink(join(root, 'checkout-other'), join(cwd, 'tools', 'other'))

        expect(await outsideLinks({ cwd, paths: ['tools/other'] })).toEqual([
            'tools/other',
        ])
    })
})
