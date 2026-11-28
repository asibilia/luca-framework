import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    BUNDLE_FILE,
    HASH_LINE,
    sourceHash,
} from '../../../scripts/build-pr-story'
import { EXAMPLE_FILE, exampleText } from '../../../scripts/write-story-example'
import { groupedStory } from '../../../src/story/testing/grouped-story'
import { story } from '../../../src/story/testing/story-fixtures'

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

    test('the rebuilt helper checks the new story fields and the example carries noise and stop_id', async () => {
        const example = JSON.parse(await Bun.file(EXAMPLE_FILE).text())
        expect(example.summary.feedback_wanted.stop_id).toBeNull()
        for (const file of example.map.files) {
            expect(file.noise).toBeNull()
        }

        const dir = await mkdtemp(join(tmpdir(), 'pr-story-bundle-'))
        try {
            const grouped_file = join(dir, 'grouped.json')
            await Bun.write(grouped_file, JSON.stringify(groupedStory()))
            const ok = await helper(['check', grouped_file])
            expect(ok.code).toBe(0)
            expect(ok.text).toContain(
                'Valid story: 24 stops, schema_version 1.'
            )

            const bad = story()
            bad.summary.feedback_wanted.stop_id = 's9'
            const bad_file = join(dir, 'bad-stop-id.json')
            await Bun.write(bad_file, JSON.stringify(bad))
            const refused = await helper(['check', bad_file])
            expect(refused.code).toBe(1)
            expect(refused.text).toContain(
                'feedback_wanted.stop_id "s9" is not a stop'
            )
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})
