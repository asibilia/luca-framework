import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const ROOT = join(import.meta.dir, '../../../..')

/** The meaning line of a `**Term**:` entry in the glossary, or `null`. */
const entryOf = (glossary: string, term: string): string | null =>
    glossary.match(new RegExp(`^\\*\\*${term}\\*\\*:\\n(.+)$`, 'm'))?.[1] ??
    null

describe('the glossary on model floors (#603)', async () => {
    const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()

    test('has Model floor and Confidence bar, each tied to Opus', () => {
        const floor = entryOf(glossary, 'Model floor')
        const bar = entryOf(glossary, 'Confidence bar')

        expect(floor).toContain('cheapest')
        expect(floor).toContain('Opus')
        expect(floor?.toLowerCase()).toContain('reviewer')
        expect(bar).toContain('Opus')
    })

    test('Shadow mode and Decision model say the model pick takes effect for a role with a floor below Opus', () => {
        for (const term of ['Shadow mode', 'Decision model']) {
            const entry = entryOf(glossary, term)

            expect(entry).toContain('floor below Opus')
        }
    })
})

describe("the glossary on Clef's effort picks (#661)", async () => {
    const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()

    test("Decision model says it's also asked about each writer's effort, in shadow mode", () => {
        const sentences = (entryOf(glossary, 'Decision model') ?? '').split(
            /(?<=\.)\s+/
        )

        expect(
            sentences.filter(
                (sentence) =>
                    /effort/i.test(sentence) &&
                    /writer/i.test(sentence) &&
                    /shadow mode/i.test(sentence)
            )
        ).not.toEqual([])
    })
})
