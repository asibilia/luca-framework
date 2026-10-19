import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { describe, expect, test } from 'bun:test'

/**
 * The engine's docs and the board's: each package's `README.md`, a short
 * index, and its topic pages under `docs/`. Every relative link in them must
 * point to a file that exists.
 */

const ENGINE_DIR = join(import.meta.dir, '..')
const BOARD_DIR = join(ENGINE_DIR, '..', 'board')

/** The READMEs and every page under `docs/`, relative to the engine package. */
const PAGES = [
    'README.md',
    ...new Bun.Glob('docs/*.md').scanSync({ cwd: ENGINE_DIR }),
    '../board/README.md',
    ...[...new Bun.Glob('docs/*.md').scanSync({ cwd: BOARD_DIR })].map(
        (page) => `../board/${page}`
    ),
].toSorted()

/**
 * The relative link targets in a markdown text, each without its `#anchor`.
 * Links with a scheme (`https:`, `mailto:`) and links to an anchor on the
 * same page are left out.
 */
const relativeLinks = (text: string): string[] =>
    [...text.matchAll(/\]\(([^)\s]+)\)/g)]
        .map((match) => match[1] ?? '')
        .filter(
            (target) =>
                !/^[a-z][a-z+.-]*:/i.test(target) && !target.startsWith('#')
        )
        .map((target) => target.split('#')[0] ?? '')

describe("the engine's and the board's docs", () => {
    test('every relative link in README.md and docs/*.md points to a file that exists', async () => {
        const links = (
            await Promise.all(
                PAGES.map(async (page) =>
                    relativeLinks(
                        await Bun.file(join(ENGINE_DIR, page)).text()
                    ).map((target) => ({ page, target }))
                )
            )
        ).flat()

        expect(links.length).toBeGreaterThan(0)
        expect(
            links
                .filter(
                    ({ page, target }) =>
                        !existsSync(join(ENGINE_DIR, dirname(page), target))
                )
                .map(({ page, target }) => `${page}: ${target}`)
        ).toEqual([])
    })

    test('a page describes a feature map folder, with a config example naming one (#597)', async () => {
        const texts = await Promise.all(
            PAGES.map((page) => Bun.file(join(ENGINE_DIR, page)).text())
        )
        const described = texts.filter(
            (text) =>
                /"feature_map":\s*"docs\/feature-map\/?"/.test(text) &&
                text.includes('*.md')
        )
        expect(described.length).toBeGreaterThan(0)
    })
})
