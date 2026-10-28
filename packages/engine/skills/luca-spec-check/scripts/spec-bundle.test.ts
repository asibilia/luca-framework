import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { formatSpecBundle, parseArgs } from './spec-bundle'

/**
 * The `/luca-spec-check` gather script's bundle, from fixture issues: the
 * spec first, then its tickets in order, then the repo's rule files and
 * whether it has a glossary and ADRs. The formatting makes no `gh` calls,
 * so these tests need no network.
 */

const SPEC = {
    number: 678,
    title: 'Spec: a cold read',
    body: 'The spec body: three fresh readers read it.',
    labels: ['spec'],
}

const TICKETS = [
    { number: 680, title: 'The first ticket', body: 'Body of the first.' },
    { number: 681, title: 'The second ticket', body: 'Body of the second.' },
    { number: 682, title: 'The third ticket', body: 'Body of the third.' },
]

const RULE_FILES = ['docs/guides/coding-standards.md', 'AGENTS.md']

/** Where each text starts in the bundle, in the order given. */
const positions = (bundle: string, texts: string[]): number[] =>
    texts.map((text) => bundle.indexOf(text))

describe('the spec bundle', () => {
    test('it prints the spec first, then each ticket in order', () => {
        const bundle = formatSpecBundle({
            spec: SPEC,
            tickets: TICKETS,
            rule_files: RULE_FILES,
            glossary: false,
            adr: false,
        })
        const texts = [
            '#678',
            'Spec: a cold read',
            'The spec body: three fresh readers read it.',
            ...TICKETS.flatMap(({ number, title, body }) => [
                `#${number}`,
                title,
                body,
            ]),
        ]
        const at = positions(bundle, texts)
        expect(at.every((position) => position >= 0)).toBe(true)
        expect(at).toEqual(at.toSorted((a, b) => a - b))
        expect(bundle).not.toContain('No tickets yet.')
    })

    test('a spec with no tickets prints the spec, then No tickets yet.', () => {
        const bundle = formatSpecBundle({
            spec: SPEC,
            tickets: [],
            rule_files: RULE_FILES,
            glossary: false,
            adr: false,
        })
        const lines = bundle.split('\n')
        expect(lines).toContain('No tickets yet.')
        const at = positions(bundle, [
            'Spec: a cold read',
            'The spec body: three fresh readers read it.',
            'No tickets yet.',
        ])
        expect(at.every((position) => position >= 0)).toBe(true)
        expect(at).toEqual(at.toSorted((a, b) => a - b))
    })

    test('it lists the rule files, and says whether GLOSSARY.md and docs/adr/ exist', () => {
        const without = formatSpecBundle({
            spec: SPEC,
            tickets: TICKETS,
            rule_files: RULE_FILES,
            glossary: false,
            adr: false,
        })
        const withBoth = formatSpecBundle({
            spec: SPEC,
            tickets: TICKETS,
            rule_files: RULE_FILES,
            glossary: true,
            adr: true,
        })
        for (const bundle of [without, withBoth]) {
            expect(bundle).toContain('docs/guides/coding-standards.md')
            expect(bundle).toContain('AGENTS.md')
        }
        expect(without).toContain('GLOSSARY.md: no')
        expect(without).toContain('docs/adr/: no')
        expect(without).not.toContain('GLOSSARY.md: yes')
        expect(without).not.toContain('docs/adr/: yes')
        expect(withBoth).toContain('GLOSSARY.md: yes')
        expect(withBoth).toContain('docs/adr/: yes')
        expect(withBoth).not.toContain('GLOSSARY.md: no')
        expect(withBoth).not.toContain('docs/adr/: no')
    })
})

describe('the gather script', () => {
    test('it imports only node: and bun modules', async () => {
        const source = await Bun.file(
            join(import.meta.dir, 'spec-bundle.ts')
        ).text()
        const modules = [
            ...source.matchAll(
                /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g
            ),
        ].map((match) => match[1] ?? '')
        expect(modules.length).toBeGreaterThan(0)
        expect(
            modules.filter(
                (name) => !name.startsWith('node:') && !name.startsWith('bun')
            )
        ).toEqual([])
    })

    test('the arguments: a spec number, and an optional --repo', () => {
        expect(parseArgs(['678'])).toEqual({ number: 678, repo: null })
        expect(parseArgs(['678', '--repo', 'o/r'])).toEqual({
            number: 678,
            repo: 'o/r',
        })
        expect(parseArgs(['--repo', 'o/r', '678'])).toEqual({
            number: 678,
            repo: 'o/r',
        })
    })

    test('the arguments: no spec number, or a --repo with no value, is null', () => {
        expect(parseArgs([])).toBeNull()
        expect(parseArgs(['--repo', 'o/r'])).toBeNull()
        expect(parseArgs(['678', '--repo'])).toBeNull()
    })
})
