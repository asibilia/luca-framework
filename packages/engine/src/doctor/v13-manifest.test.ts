import { describe, expect, test } from 'bun:test'
import filter from 'lodash/filter'
import find from 'lodash/find'
import map from 'lodash/map'
import some from 'lodash/some'
import sortBy from 'lodash/sortBy'
import uniq from 'lodash/uniq'

import { V13_MANIFEST_PATH, loadV13Manifest } from './v13-manifest'

/**
 * Guards the generated `v13-files.json`: it parses, it's sorted (so it diffs
 * cleanly), and its parts agree with each other. It doesn't regenerate it;
 * that needs the network (see `scripts/generate-v13-manifest.ts`).
 */

const manifest = await loadV13Manifest()

const semverSorted = (versions: string[]) =>
    [...versions].sort(Bun.semver.order)

/** The only places v13 copies files to. */
const TARGET_PREFIXES = [
    '~/.claude/skills/',
    '~/.claude/agents/',
    '~/.claude/commands/',
    '~/.claude/luca-statusline.ts',
    '~/.gemini/antigravity-cli/skills/',
    '~/.gemini/antigravity-cli/agents/',
    '<repo>/.claude/hooks/',
]

describe('v13-files.json', () => {
    test('is the canonical serialization of itself', async () => {
        const text = await Bun.file(V13_MANIFEST_PATH).text()
        expect(JSON.stringify(manifest, null, 4) + '\n').toBe(text)
    })

    test('covers the published 13.x versions, in semver order', () => {
        const { generated_from } = manifest
        expect(generated_from).toEqual(semverSorted(uniq(generated_from)))
        expect(generated_from).toContain('13.0.1')
        expect(generated_from).toContain('13.1.0-alpha.0')
    })

    test('lists each target once, sorted, with sorted hashes and versions', () => {
        const targets = map(manifest.files, 'target')
        expect(targets).toEqual(sortBy(uniq(targets)))
        for (const file of manifest.files) {
            expect(file.sha256).toEqual(sortBy(uniq(file.sha256)))
            expect(file.versions).toEqual(semverSorted(uniq(file.versions)))
            for (const version of file.versions) {
                expect(manifest.generated_from).toContain(version)
            }
            expect(
                some(TARGET_PREFIXES, (prefix) =>
                    file.target.startsWith(prefix)
                )
            ).toBe(true)
        }
    })

    test('wires only hook scripts it also fingerprints', () => {
        const repoHooks = filter(manifest.settings, (setting) =>
            setting.id.startsWith('repo-hook-')
        )
        expect(repoHooks).toHaveLength(3)
        for (const { id, match } of repoHooks) {
            if (match.kind !== 'array_entry_hook_command_contains') {
                throw new Error(`${id} should match on the hook command`)
            }
            // `text` is `/.claude/hooks/<name>.ts`.
            expect(
                find(manifest.files, { target: `<repo>${match.text}` })
            ).toBeDefined()
        }
    })

    test('unwires the stage-gate hooks and keeps the MuninnDB entry', () => {
        const ids = map(manifest.settings, 'id')
        expect(ids).toEqual(sortBy(uniq(ids)))
        const action = (id: string) => find(manifest.settings, { id })?.action
        expect(action('claude-stage-gate-hook')).toBe('remove')
        expect(action('antigravity-stage-gate-hook')).toBe('remove')
        expect(action('claude-status-line')).toBe('remove')
        expect(action('claude-muninn-mcp')).toBe('keep')
    })

    test('has .gitignore variants that start and end on their markers', () => {
        const { start_marker, variants } = manifest.gitignore_block
        for (const { header, entries, end_marker } of variants) {
            expect(header[0]).toBe(start_marker)
            expect(entries[entries.length - 1]).toBe(end_marker)
        }
    })
})
