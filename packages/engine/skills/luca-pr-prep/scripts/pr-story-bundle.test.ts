import { describe, expect, test } from 'bun:test'

import {
    BUNDLE_FILE,
    HASH_LINE,
    sourceHash,
} from '../../../scripts/build-pr-story'
import { EXAMPLE_FILE, exampleText } from '../../../scripts/write-story-example'

/**
 * The files the `/luca-pr-prep` skill ships that are made from the
 * engine's source: the bundled helper and the example story. Each must
 * match its source, so the skill checks stories with today's schema.
 */

/** Runs the shipped helper the way the skill does. */
const helper = async (args: string[]) => {
    const child = Bun.spawn(['bun', BUNDLE_FILE, ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
    ])
    return { code, text: stdout + stderr }
}

describe("the luca-pr-prep skill's shipped files", () => {
    test('the helper was built from the story source as it is now', async () => {
        const [, hash_line = ''] = (await Bun.file(BUNDLE_FILE).text()).split(
            '\n',
            2
        )
        // When this fails: bun packages/engine/scripts/build-pr-story.ts
        expect(hash_line).toBe(`${HASH_LINE}${await sourceHash()}`)
    })

    test('the example story is the one the tests use, and the shipped helper accepts it', async () => {
        // When this fails: bun packages/engine/scripts/write-story-example.ts
        expect(await Bun.file(EXAMPLE_FILE).text()).toBe(exampleText())
        const checked = await helper(['check', EXAMPLE_FILE])
        expect(checked.text).toContain(
            'Valid story: 2 stops, schema_version 1.'
        )
        expect(checked.code).toBe(0)
    })

    test('the shipped helper refuses a story that breaks the schema', async () => {
        const broken = `${import.meta.dir}/../../../package.json`
        const checked = await helper(['check', broken])
        expect(checked.code).toBe(1)
        expect(checked.text).toContain('is not a valid story')
    })
})
