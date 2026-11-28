import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { WALK_COMMANDS } from './walk-app'

/**
 * The `@luca/walk` package (#753): its VS Code manifest, the one seam
 * that keeps `vscode` out of the app, and its glossary entry.
 */

const PACKAGE = join(import.meta.dir, '..')
const ROOT = join(PACKAGE, '../..')
const SRC = join(PACKAGE, 'src')

/** The only files that may import `vscode`: the wiring. */
const WIRING = ['src/extension.ts', 'src/vscode-host.ts']

const IMPORTS_VSCODE =
    /(?:\bfrom\s*['"]vscode['"]|\bimport\s*\(\s*['"]vscode['"]\s*\)|\brequire\s*\(\s*['"]vscode['"]\s*\)|^\s*import\s*['"]vscode['"])/m

/** Every `.ts` file under `src`, relative to the package. */
const sourceFiles = (): string[] =>
    [...new Bun.Glob('**/*.ts').scanSync({ cwd: SRC })]
        .map((file) => join('src', file))
        .toSorted()

const COMMANDS: [string, string][] = [
    ['lucaWalk.openPullRequest', 'Open pull request'],
    ['lucaWalk.openFromList', 'Open a review-ready pull request'],
    ['lucaWalk.showSummary', 'Show the summary'],
    ['lucaWalk.showMap', 'Show the map'],
    ['lucaWalk.startWalk', 'Start the walk'],
    ['lucaWalk.nextStop', 'Next stop'],
    ['lucaWalk.previousStop', 'Previous stop'],
    ['lucaWalk.nextChange', 'Next change in this file'],
    ['lucaWalk.previousChange', 'Previous change in this file'],
    ['lucaWalk.backToWalk', 'Back to the walk'],
    ['lucaWalk.suggestChange', 'Suggest a change'],
    ['lucaWalk.commentOnFile', 'Comment on this file'],
    ['lucaWalk.commentOnPullRequest', 'Comment on the pull request'],
    ['lucaWalk.toggleLooksGood', 'This file looks good'],
    ['lucaWalk.markStopLooksGood', 'This stop looks good'],
    ['lucaWalk.sendReview', 'Send the review'],
    ['lucaWalk.writeStory', 'Write the story'],
    ['lucaWalk.reloadStory', 'Reload the story'],
]

const ViewSchema = z.object({ id: z.string(), type: z.string().optional() })
const ContainerSchema = z.object({ id: z.string() })

const ManifestSchema = z.object({
    activationEvents: z.array(z.string()),
    contributes: z.object({
        configurationDefaults: z.record(z.string(), z.unknown()).optional(),
        commands: z.array(
            z.object({
                command: z.string(),
                title: z.string(),
                category: z.string().optional(),
                icon: z.string().optional(),
            })
        ),
        viewsContainers: z.record(z.string(), z.array(ContainerSchema)),
        views: z.record(z.string(), z.array(ViewSchema)),
        menus: z.record(
            z.string(),
            z.array(
                z.object({
                    command: z.string(),
                    group: z.string().optional(),
                    when: z.string().optional(),
                })
            )
        ),
    }),
})

const ChangesetConfigSchema = z.object({
    fixed: z.array(z.array(z.string())),
    linked: z.array(z.array(z.string())),
})

const readManifest = async () =>
    ManifestSchema.parse(
        JSON.parse(await readFile(join(PACKAGE, 'package.json'), 'utf8'))
    )

/** The views of every container under `place` in the manifest. */
const viewsUnder = (manifest: z.infer<typeof ManifestSchema>, place: string) =>
    (manifest.contributes.viewsContainers[place] ?? []).flatMap(
        ({ id }) => manifest.contributes.views[id] ?? []
    )

describe('the @luca/walk package (#753)', () => {
    test('only src/extension.ts and src/vscode-host.ts import vscode', async () => {
        const files = sourceFiles()
        const importing: string[] = []
        for (const file of files) {
            const text = await readFile(join(PACKAGE, file), 'utf8')
            if (IMPORTS_VSCODE.test(text)) importing.push(file)
        }

        for (const file of WIRING) {
            expect(existsSync(join(PACKAGE, file))).toBe(true)
        }
        expect(importing.filter((file) => !WIRING.includes(file))).toEqual([])
        expect(importing.toSorted()).toEqual(WIRING.toSorted())
    })

    test('the manifest contributes the 17 commands, the Stops and Context views, and onStartupFinished', async () => {
        const manifest = await readManifest()
        const declared = manifest.contributes.commands
        const hidden = new Set(
            (manifest.contributes.menus.commandPalette ?? [])
                .filter(({ when }) => when === 'false')
                .map(({ command }) => command)
        )
        const commands = declared.filter(({ command }) => !hidden.has(command))
        const original = commands.filter(
            ({ command }) => command !== 'lucaWalk.markStopLooksGood'
        )
        const original_expected = COMMANDS.filter(
            ([command]) => command !== 'lucaWalk.markStopLooksGood'
        )

        expect(
            original.map(({ command, title }) => [command, title]).toSorted()
        ).toEqual(original_expected.toSorted())
        expect(commands.every(({ category }) => category === 'Luca Walk')).toBe(
            true
        )
        const declaredIds = new Set(declared.map(({ command }) => command))
        const referenced = Object.values(manifest.contributes.menus)
            .flat()
            .map(({ command }) => command)
        expect(referenced.filter((id) => !declaredIds.has(id))).toEqual([])
        expect(
            viewsUnder(manifest, 'activitybar').map(({ id }) => id)
        ).toContain('lucaWalk.stops')
        expect([
            ...viewsUnder(manifest, 'activitybar'),
            ...viewsUnder(manifest, 'secondarySidebar'),
        ]).toContainEqual(
            expect.objectContaining({ id: 'lucaWalk.context', type: 'webview' })
        )
        expect(manifest.activationEvents).toContain('onStartupFinished')
    })

    test('the manifest contributes the 18 commands, the Stops and Context views, and onStartupFinished', async () => {
        const manifest = await readManifest()
        const declared = manifest.contributes.commands
        const hidden = new Set(
            (manifest.contributes.menus.commandPalette ?? [])
                .filter(({ when }) => when === 'false')
                .map(({ command }) => command)
        )
        const commands = declared.filter(({ command }) => !hidden.has(command))

        expect(
            commands.map(({ command, title }) => [command, title]).toSorted()
        ).toEqual(COMMANDS.toSorted())
        expect(WALK_COMMANDS.toSorted()).toEqual(
            COMMANDS.map(([command]) => command).toSorted()
        )
        expect(commands.every(({ category }) => category === 'Luca Walk')).toBe(
            true
        )
        const declaredIds = new Set(declared.map(({ command }) => command))
        const referenced = Object.values(manifest.contributes.menus)
            .flat()
            .map(({ command }) => command)
        expect(referenced.filter((id) => !declaredIds.has(id))).toEqual([])
        expect(
            viewsUnder(manifest, 'activitybar').map(({ id }) => id)
        ).toContain('lucaWalk.stops')
        expect([
            ...viewsUnder(manifest, 'activitybar'),
            ...viewsUnder(manifest, 'secondarySidebar'),
        ]).toContainEqual(
            expect.objectContaining({ id: 'lucaWalk.context', type: 'webview' })
        )
        expect(manifest.activationEvents).toContain('onStartupFinished')
    })

    test('the manifest sets configurationDefaults for single-file full-file inline diffs', async () => {
        const manifest = await readManifest()

        expect(manifest.contributes.configurationDefaults).toEqual({
            'diffEditor.renderSideBySide': false,
            'diffEditor.hideUnchangedRegions.enabled': false,
        })
    })

    test('the manifest places Context under Stops in the left lucaWalk sidebar and removes secondarySidebar', async () => {
        const manifest = await readManifest()

        expect(manifest.contributes.viewsContainers.activitybar).toContainEqual(
            expect.objectContaining({ id: 'lucaWalk' })
        )
        expect(manifest.contributes.views.lucaWalk).toEqual([
            expect.objectContaining({ id: 'lucaWalk.stops' }),
            expect.objectContaining({
                id: 'lucaWalk.context',
                type: 'webview',
            }),
        ])
        expect(
            manifest.contributes.viewsContainers.secondarySidebar
        ).toBeUndefined()
        expect(manifest.contributes.views.lucaWalkContext).toBeUndefined()
    })

    test('the manifest contributes an inline This stop looks good button on Stops items and vscode-host sets stop contextValue', async () => {
        const manifest = await readManifest()
        const vscode_host = await readFile(
            join(PACKAGE, 'src/vscode-host.ts'),
            'utf8'
        )

        expect(manifest.contributes.commands).toContainEqual(
            expect.objectContaining({
                command: 'lucaWalk.markStopLooksGood',
                icon: '$(check)',
            })
        )
        expect(manifest.contributes.menus['view/item/context']).toContainEqual({
            command: 'lucaWalk.markStopLooksGood',
            group: 'inline',
            when: 'view == lucaWalk.stops && viewItem == stop',
        })
        expect(vscode_host).toMatch(/\.contextValue\s*=\s*['"]stop['"]/)
    })

    test('the glossary has a Luca Walk entry', async () => {
        const glossary = await readFile(join(ROOT, 'GLOSSARY.md'), 'utf8')
        const entry = /^\*\*Luca Walk\*\*:\n(.+)$/m.exec(glossary)?.[1] ?? null

        expect(entry).not.toBeNull()
        expect(entry).toContain('VS Code')
    })

    test('the glossary has a Review record entry', async () => {
        const glossary = await readFile(join(ROOT, 'GLOSSARY.md'), 'utf8')
        const entry =
            /^\*\*Review record\*\*:\n(.+)$/m.exec(glossary)?.[1] ?? null

        expect(entry).not.toBeNull()
        expect(entry).toContain('commit')
    })

    test("luca-walk is in no fixed or linked group of the changesets' config", async () => {
        const name = z
            .object({ name: z.string() })
            .parse(
                JSON.parse(
                    await readFile(join(PACKAGE, 'package.json'), 'utf8')
                )
            ).name
        const config = ChangesetConfigSchema.parse(
            JSON.parse(
                await readFile(join(ROOT, '.changeset', 'config.json'), 'utf8')
            )
        )

        expect(name).toBe('luca-walk')
        expect(config.fixed.flat()).not.toContain(name)
        expect(config.linked.flat()).not.toContain(name)
    })
})
