import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { compile } from '@alecsibilia/luca-tools/compile'
import { defineSkill } from '@alecsibilia/luca-tools/define'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { installSkills, listBundledArtifacts } from './install-skills.ts'

/**
 * The empty-commands-bucket guard.
 *
 * luca folded every slash command into its same-named skill, so the
 * artifact manifest now compiles ZERO commands. That is fine for the
 * install half — there is nothing to copy — but it is a trap for the
 * UNINSTALL half:
 *
 *   `installSkills` only authorizes a bucket's retired-artifact prune
 *   when the bundled SOURCE directory for that bucket exists
 *   (`prunable.commands = artifacts.commands && existsSync(<root>/commands)`).
 *   A compiler that emits the directory only as a side effect of writing
 *   a command file leaves `<root>/commands` absent once the list empties,
 *   the gate reads that as "bucket not enumerable", and every
 *   `{ kind: 'command' }` entry in `RETIRED_ARTIFACTS` silently evicts
 *   nothing — the 17 folded commands stay slash-invocable in every
 *   existing `~/.claude/commands/` forever while the retired list reads
 *   as an uninstall that shipped.
 *
 * So the compiler emits the commands bucket unconditionally. These tests
 * drive the REAL path — `compile()` writes the bundle, `installSkills()`
 * consumes it — rather than asserting on the compiler's internals, because
 * the defect only appears at the seam between them.
 */
describe('empty command bucket — compile → install → prune', () => {
    let out: string
    let home: string

    beforeEach(async () => {
        out = await mkdtemp(join(tmpdir(), 'luca-empty-cmd-out-'))
        home = await mkdtemp(join(tmpdir(), 'luca-empty-cmd-home-'))
    })

    afterEach(async () => {
        await rm(out, { recursive: true, force: true })
        await rm(home, { recursive: true, force: true })
    })

    /** A minimal real artifact so the compile is not a no-op. */
    const someSkill = defineSkill({
        name: 'guard-fixture-skill',
        description: 'Fixture skill so the compiled bundle is non-empty.',
        body: '<main>\nfixture\n</main>\n',
    })

    test('compile emits the commands directory even with zero commands', async () => {
        await compile([someSkill], out)

        expect(existsSync(join(out, '.claude', 'commands'))).toBe(true)
    })

    test('the emitted bucket enumerates as empty, not as unresolvable', async () => {
        await compile([someSkill], out)

        const bundled = await listBundledArtifacts({
            claudeArtifactsRoot: join(out, '.claude'),
            skillsRoot: join(out, 'skills'),
        })

        // Not null: the bundle resolved. `commands: []` is the honest
        // answer — luca ships no commands — and it is what authorizes the
        // prune while still protecting any name that IS still bundled.
        expect(bundled).not.toBeNull()
        expect(bundled!.commands).toEqual([])
        expect(bundled!.skills).toContain('guard-fixture-skill')
    })

    test('a retired command is still evicted from an existing install', async () => {
        await compile([someSkill], out)

        // Simulate a user who ran an older `luca init`: the folded command
        // is sitting in their harness home.
        await mkdir(join(home, 'commands'), { recursive: true })
        await writeFile(join(home, 'commands', 'phase-plan.md'), '# stale\n')

        await installSkills({
            home,
            claudeArtifactsRoot: join(out, '.claude'),
            skillsRoot: join(out, 'skills'),
            artifacts: { agents: true, commands: true, skills: true },
            retired: [
                { kind: 'command', name: 'phase-plan.md', retiredIn: '13.1.0' },
            ],
        })

        expect(existsSync(join(home, 'commands', 'phase-plan.md'))).toBe(false)
        expect(
            existsSync(
                join(
                    home,
                    '.luca-retired-backup',
                    'commands',
                    'phase-plan.md'
                )
            )
        ).toBe(true)
    })

    test('an empty bucket never installs stray files into the harness home', async () => {
        await compile([someSkill], out)

        await installSkills({
            home,
            claudeArtifactsRoot: join(out, '.claude'),
            skillsRoot: join(out, 'skills'),
            artifacts: { agents: true, commands: true, skills: true },
            retired: [],
        })

        // The bucket marker that keeps the directory packable must never
        // reach the user's commands/ — copyDir is .md-only, and this
        // asserts the marker is not named like a command.
        const { readdir } = await import('node:fs/promises')
        const installed = existsSync(join(home, 'commands'))
            ? await readdir(join(home, 'commands'))
            : []
        expect(installed).toEqual([])
    })
})
