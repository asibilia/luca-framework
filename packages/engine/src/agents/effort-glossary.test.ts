import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const ROOT = join(import.meta.dir, '../../../..')

/** The meaning and `_Avoid_` lines of a `**Term**:` entry, or `null`. */
const entryOf = (
    glossary: string,
    term: string
): { meaning: string; avoid: string } | null => {
    const found = glossary.match(
        new RegExp(`^\\*\\*${term}\\*\\*:\\n(.+)\\n(_Avoid_: .+)$`, 'm')
    )
    const [, meaning, avoid] = found ?? []
    return meaning === undefined || avoid === undefined
        ? null
        : { meaning, avoid }
}

describe('the glossary on effort (#659)', () => {
    test('has Effort: how hard an agent thinks, its five levels, and reviewers at xhigh', async () => {
        const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()

        expect(entryOf(glossary, 'Effort')).toEqual({
            meaning:
                'How hard an agent thinks before it acts: low, medium, high, xhigh or max. Each role has one; reviewers always run at xhigh.',
            avoid: '_Avoid_: thinking budget, reasoning level',
        })
    })
})
