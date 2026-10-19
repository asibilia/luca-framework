import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const ROOT = join(import.meta.dir, '../../../..')

const ENGINE = join(ROOT, 'packages/engine')

/** The meaning line of a `**Term**:` entry in the glossary, or `null`. */
const entryOf = (glossary: string, term: string): string | null =>
    glossary.match(new RegExp(`^\\*\\*${term}\\*\\*:\\n(.+)$`, 'm'))?.[1] ??
    null

describe('the docs on helpers (#627)', () => {
    test('the glossary has Helper: a read-only Haiku session an agent starts to search the repo, not an agent', async () => {
        const glossary = await Bun.file(join(ROOT, 'GLOSSARY.md')).text()
        const helper = entryOf(glossary, 'Helper')

        expect(helper).toMatch(/read-only/i)
        expect(helper).toContain('Haiku')
        expect(helper).toMatch(/search/i)
        expect(helper).toMatch(/not an agent/i)
    })

    test('the engine docs describe the searcher helper: Haiku, read-only, and 3 at once', async () => {
        const paths = [
            join(ENGINE, 'README.md'),
            ...[...new Bun.Glob('*.md').scanSync(join(ENGINE, 'docs'))].map(
                (name) => join(ENGINE, 'docs', name)
            ),
        ]
        const texts = await Promise.all(
            paths.map((path) => Bun.file(path).text())
        )
        const describing = texts.filter(
            (text) =>
                text.includes('searcher') &&
                text.includes('Haiku') &&
                /helper/i.test(text)
        )

        expect(describing.length).toBeGreaterThan(0)
        expect(describing.join('\n')).toMatch(
            /\b(3|three)\b[^\n]*helper|helper[^\n]*\b(3|three)\b/i
        )
    })
})
