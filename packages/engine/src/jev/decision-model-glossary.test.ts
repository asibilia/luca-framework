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

    test("Decision model says it is also asked about each writer's effort, in shadow mode", () => {
        const entry = entryOf(glossary, 'Decision model') ?? ''
        const sentence = entry
            .split(/(?<=\.)\s+/)
            .find((each) => each.toLowerCase().includes('effort'))

        expect(sentence).toBeDefined()
        expect(sentence?.toLowerCase()).toContain('writer')
        expect(sentence?.toLowerCase()).toContain('shadow mode')
    })
})

describe('the glossary on the model trial (#698)', async () => {
    const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()

    test('has Model trial, set by models.trial_share and off by default, and Shadow mode still avoids trial mode', () => {
        expect(entryOf(glossary, 'Model trial')).toBe(
            "A share of the writer launches Clef would move to a cheaper model, but isn't sure enough about, that really run on Clef's pick (the trial group), against the same kind of launches that stay on Opus (the control group). Set by `models.trial_share`; off by default. Unlike shadow mode, a model trial acts."
        )
        const avoid = glossary.match(
            /^\*\*Shadow mode\*\*:\n.+\n_Avoid_: (.+)$/m
        )?.[1]
        expect(avoid?.split(', ')).toContain('trial mode')
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
