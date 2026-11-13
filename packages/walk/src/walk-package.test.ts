import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

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
    ['lucaWalk.sendReview', 'Send the review'],
    ['lucaWalk.writeStory', 'Write the story'],
    ['lucaWalk.reloadStory', 'Reload the story'],
]

const ViewSchema = z.object({ id: z.string(), type: z.string().optional() })
const ContainerSchema = z.object({ id: z.string() })

const ManifestSchema = z.object({
    activationEvents: z.array(z.string()),
    contributes: z.object({
        commands: z.array(
            z.object({
                command: z.string(),
                title: z.string(),
                category: z.string().optional(),
            })
        ),
        viewsContainers: z.record(z.string(), z.array(ContainerSchema)),
        views: z.record(z.string(), z.array(ViewSchema)),
    }),
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
        const commands = manifest.contributes.commands

        expect(
            commands.map(({ command, title }) => [command, title]).toSorted()
        ).toEqual(COMMANDS.toSorted())
        expect(commands.every(({ category }) => category === 'Luca Walk')).toBe(
            true
        )
        expect(
            viewsUnder(manifest, 'activitybar').map(({ id }) => id)
        ).toContain('lucaWalk.stops')
        expect(viewsUnder(manifest, 'secondarySidebar')).toContainEqual(
            expect.objectContaining({ id: 'lucaWalk.context', type: 'webview' })
        )
        expect(manifest.activationEvents).toContain('onStartupFinished')
    })

    test('the glossary has a Luca Walk entry', async () => {
        const glossary = await readFile(join(ROOT, 'GLOSSARY.md'), 'utf8')
        const entry = /^\*\*Luca Walk\*\*:\n(.+)$/m.exec(glossary)?.[1] ?? null

        expect(entry).not.toBeNull()
        expect(entry).toContain('VS Code')
    })
})
