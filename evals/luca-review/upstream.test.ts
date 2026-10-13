import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

/**
 * Setup A is Corey Gallon's agent-review skill exactly as published at the
 * pinned commit (MIT; its LICENSE travels with it). The eval measures our
 * skill against it, so nobody may edit it: this pins every file's SHA-256,
 * and that no file was added or removed.
 */

const UPSTREAM_DIR = join(import.meta.dir, 'upstream')
const SKILL_DIR = join(UPSTREAM_DIR, 'agent-review')

const PinnedSchema = z.object({
    repo: z.literal('https://github.com/captivus/agent-review'),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    files: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
})

const allFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
            ? allFiles(join(dir, entry.name))
            : [join(dir, entry.name)]
    )

const sha256 = async (path: string): Promise<string> =>
    new Bun.CryptoHasher('sha256')
        .update(await Bun.file(path).arrayBuffer())
        .digest('hex')

describe('setup A, the upstream agent-review skill', () => {
    test('every file is exactly as pinned, and none was added', async () => {
        const pinned = PinnedSchema.parse(
            await Bun.file(join(UPSTREAM_DIR, 'pinned.json')).json()
        )
        const files = allFiles(SKILL_DIR)
            .map((path) => relative(SKILL_DIR, path))
            .sort()
        expect(files).toEqual(Object.keys(pinned.files).sort())
        for (const [file, hash] of Object.entries(pinned.files)) {
            expect(await sha256(join(SKILL_DIR, file))).toBe(hash)
        }
    })

    test('it keeps its MIT license', async () => {
        const license = await Bun.file(join(SKILL_DIR, 'LICENSE')).text()
        expect(license).toContain('MIT License')
        expect(license).toContain('Copyright (c) 2026 Corey Gallon')
    })
})
