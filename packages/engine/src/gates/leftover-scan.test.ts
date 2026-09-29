import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { scanLeftovers } from './leftover-scan'

describe('scanLeftovers', () => {
    test('a folder with its own git repo is a hit, since git cannot commit it as files', () => {
        const hits = scanLeftovers({
            changes: [
                { path: 'src/sum.ts', change: 'added' },
                { path: 'vendor/clone/', change: 'added' },
            ],
            test_files: [],
            mention_text: '',
            used_code: { 'src/sum.ts': true },
        })

        expect(hits).toEqual([
            {
                path: 'vendor/clone/',
                reason: 'a folder with its own git repo in it, which git cannot commit as files',
            },
        ])
    })
})

/** The scan of these new files, none of which anything imports. */
const scanUnused = (paths: string[]) =>
    scanLeftovers({
        changes: paths.map((path) => ({ path, change: 'added' as const })),
        test_files: [],
        mention_text: '',
        used_code: Object.fromEntries(paths.map((path) => [path, false])),
    })

describe('scanLeftovers and files loaded by name (#507)', () => {
    test('vite.config.ts and app/entry.server.tsx in a web package are not flagged as unused', () => {
        expect(
            scanUnused([
                'packages/web/vite.config.ts',
                'packages/web/app/entry.server.tsx',
            ])
        ).toEqual([])
    })

    test('config files of any tool, by the *.config.* name, are not flagged as unused', () => {
        expect(
            scanUnused([
                'vitest.config.ts',
                'eslint.config.mjs',
                'tailwind.config.js',
                'postcss.config.cjs',
                'packages/web/react-router.config.ts',
                'packages/site/astro.config.mjs',
            ])
        ).toEqual([])
    })

    test('framework entry, root, routes, and middleware files are not flagged as unused', () => {
        expect(
            scanUnused([
                'packages/web/app/entry.client.tsx',
                'packages/web/app/root.tsx',
                'packages/web/app/routes.ts',
                'packages/next/middleware.ts',
            ])
        ).toEqual([])
    })

    test('files under app/routes/, pages/, src/app/, and src/pages/ are not flagged as unused', () => {
        expect(
            scanUnused([
                'packages/web/app/routes/home.tsx',
                'packages/docs/pages/about.tsx',
                'packages/next/src/app/layout.tsx',
                'packages/site/src/pages/contact.tsx',
            ])
        ).toEqual([])
    })
})

describe('scanLeftovers still catches real leftovers (#507)', () => {
    test('a stray notes.md, an unused scratch.ts, and an unused ordinary module are flagged, while the framework files beside them are not', () => {
        const hits = scanUnused([
            'packages/web/vite.config.ts',
            'packages/web/app/entry.server.tsx',
            'packages/web/app/helpers.ts',
            'notes.md',
            'src/scratch.ts',
        ])

        expect([...new Set(hits.map(({ path }) => path))].sort()).toEqual([
            'notes.md',
            'packages/web/app/helpers.ts',
            'src/scratch.ts',
        ])
        expect(hits).toContainEqual({
            path: 'packages/web/app/helpers.ts',
            reason: 'a new script or module that nothing uses',
        })
    })
})

describe('the engine README (#507)', () => {
    const readme = () =>
        Bun.file(join(import.meta.dir, '..', '..', 'README.md')).text()

    /** The README's paragraphs and list items, one each. */
    const paragraphs = async () => (await readme()).split(/\n\s*\n/)

    test("documents the leftover scan's allowlist of files loaded by name", async () => {
        const text = await readme()
        const names = [
            '*.config.',
            'entry.server.',
            'entry.client.',
            'root.',
            'routes.',
            'middleware.',
            'app/routes/',
            'pages/',
            'src/app/',
            'src/pages/',
        ]

        expect(names.filter((name) => !text.includes(name))).toEqual([])
    })

    test('documents that a file the repo names (such as in a TOC) is neither unused nor scratch', async () => {
        expect(
            (await paragraphs()).some(
                (paragraph) =>
                    /scratch/i.test(paragraph) &&
                    /\bTOC\b|\.toc\b/i.test(paragraph) &&
                    /nothing uses|unused/i.test(paragraph)
            )
        ).toBe(true)
    })

    test("documents that an agent's changeset is dropped and journaled as changeset_dropped", async () => {
        expect(
            (await paragraphs()).some(
                (paragraph) =>
                    paragraph.includes('changeset_dropped') &&
                    /\.changeset\//.test(paragraph)
            )
        ).toBe(true)
    })
})
