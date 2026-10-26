import { realpathSync } from 'node:fs'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { darwinUserTempDir } from './launch-paths'

/**
 * macOS's per-user temp folder, which the launcher adds to a writer's
 * sandbox: Foundation stages atomic writes there, not in `$TMPDIR`, so a
 * Swift rebuild needs it. A stand-in command plays `getconf`.
 */

let folder = ''

beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'luca-user-temp-'))
})

afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
})

describe("macOS's per-user temp folder (DARWIN_USER_TEMP_DIR)", () => {
    test('is the real path of the folder getconf prints, with no symlinks', async () => {
        const real = join(folder, 'T')
        const link = join(folder, 'link')
        await mkdir(real)
        await symlink(real, link)

        expect(
            await darwinUserTempDir({
                platform: 'darwin',
                getconf: ['echo', `${link}/`],
            })
        ).toBe(realpathSync(real))
    })

    test('is null off macOS, when getconf fails or is missing, or when its folder is not there', async () => {
        await mkdir(join(folder, 'T'))
        expect(
            await darwinUserTempDir({
                platform: 'linux',
                getconf: ['echo', join(folder, 'T')],
            })
        ).toBeNull()
        expect(
            await darwinUserTempDir({ platform: 'darwin', getconf: ['false'] })
        ).toBeNull()
        expect(
            await darwinUserTempDir({
                platform: 'darwin',
                getconf: [join(folder, 'no-such-getconf')],
            })
        ).toBeNull()
        expect(
            await darwinUserTempDir({
                platform: 'darwin',
                getconf: ['echo', join(folder, 'missing')],
            })
        ).toBeNull()
    })
})
