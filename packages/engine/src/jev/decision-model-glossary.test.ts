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

describe('the glossary on effort (#659)', async () => {
    const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()

    test('has Effort, with its levels, xhigh reviewers, and the words to avoid', () => {
        expect(glossary).toContain(
            '**Effort**:\nHow hard an agent thinks before it acts: low, medium, high, xhigh or max. Each role has one; reviewers always run at xhigh.\n_Avoid_: thinking budget, reasoning level\n'
        )
    })
})
