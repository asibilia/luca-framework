/**
 * Guards the per-repo half of the retired-artifact uninstall.
 *
 * The regression this pins: retiring an artifact drops it from the bundle,
 * so a scanner that matches the bundle alone goes blind to pre-v13
 * per-repo copies of exactly the artifacts that most need evicting.
 */
import { describe, expect, test } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { RETIRED_ARTIFACTS, listBundledArtifacts } from '../../../init'
import type { BundledArtifacts } from '../../../init'
import { scanStray, strayLocalInstallCheck } from './stray-local-install'

/** A bundle that ships one command and one skill, and nothing retired. */
const BUNDLE: BundledArtifacts = {
    commands: ['phase-plan.md'],
    agents: ['luca-executor.md'],
    skills: ['phase-plan'],
}

/** First retired entry of each kind, so the test tracks the real list. */
const retiredNamed = (kind: 'command' | 'skill'): string => {
    const entry = RETIRED_ARTIFACTS.find((r) => r.kind === kind)
    if (!entry) throw new Error(`no retired ${kind} to test against`)
    return entry.name
}

async function makeRepo(): Promise<string> {
    return await mkdtemp(join(tmpdir(), 'luca-stray-'))
}

async function seedCommand(repo: string, name: string): Promise<void> {
    await mkdir(join(repo, '.claude', 'commands'), { recursive: true })
    await writeFile(join(repo, '.claude', 'commands', name), '# stub\n')
}

async function seedSkill(repo: string, name: string): Promise<void> {
    await mkdir(join(repo, '.claude', 'skills', name), { recursive: true })
    await writeFile(
        join(repo, '.claude', 'skills', name, 'SKILL.md'),
        '# stub\n'
    )
}

describe('scanStray — retired per-repo copies', () => {
    test('a retired command/skill left in a repo is detected and quarantined', async () => {
        const repo = await makeRepo()
        try {
            const command = retiredNamed('command')
            const skill = retiredNamed('skill')
            await seedCommand(repo, command)
            await seedSkill(repo, skill)

            const { items } = await scanStray(repo, BUNDLE)
            const labels = items.map((i) => i.label)

            expect(labels).toContain(`.claude/commands/${command}`)
            expect(labels).toContain(`.claude/skills/${skill}/`)
            for (const item of items) {
                expect(item.disposition).toBe('quarantine')
            }
        } finally {
            await rm(repo, { recursive: true, force: true })
        }
    })

    test('a still-bundled copy is detected and deleted, not quarantined', async () => {
        const repo = await makeRepo()
        try {
            await seedCommand(repo, 'phase-plan.md')
            await seedSkill(repo, 'phase-plan')

            const { items } = await scanStray(repo, BUNDLE)

            expect(items.map((i) => i.label).sort()).toEqual([
                '.claude/commands/phase-plan.md',
                '.claude/skills/phase-plan/',
            ])
            for (const item of items) {
                expect(item.disposition).toBe('remove')
            }
        } finally {
            await rm(repo, { recursive: true, force: true })
        }
    })

    test('the live bundle wins: a retired name still shipped is a delete, listed once', async () => {
        const repo = await makeRepo()
        try {
            const skill = retiredNamed('skill')
            await seedSkill(repo, skill)

            // Stale-list scenario: the name is retired AND still bundled.
            const stale: BundledArtifacts = { ...BUNDLE, skills: [skill] }
            const { items } = await scanStray(repo, stale)

            expect(items).toHaveLength(1)
            expect(items[0]?.disposition).toBe('remove')
        } finally {
            await rm(repo, { recursive: true, force: true })
        }
    })

    test('an unenumerable bundle matches nothing by name', async () => {
        const repo = await makeRepo()
        try {
            await seedCommand(repo, retiredNamed('command'))
            await seedSkill(repo, 'phase-plan')

            const { items } = await scanStray(repo, null)

            expect(items).toEqual([])
        } finally {
            await rm(repo, { recursive: true, force: true })
        }
    })

    test('user-authored artifacts are never candidates', async () => {
        const repo = await makeRepo()
        try {
            await seedCommand(repo, 'my-own.md')
            await seedSkill(repo, 'my-own-skill')

            const { items } = await scanStray(repo, BUNDLE)

            expect(items).toEqual([])
        } finally {
            await rm(repo, { recursive: true, force: true })
        }
    })
})

describe('fix() — retired copies are moved, not destroyed', () => {
    test('quarantines into .claude/.luca-retired-backup/ and leaves user files alone', async () => {
        const bundled = await listBundledArtifacts()
        if (!bundled) {
            // No built bundle in this tree (`bun run build` not run), so
            // `fix()` can authorize nothing. The injected-bundle cases
            // above cover the logic; skip rather than assert vacuously.
            return
        }

        const repo = await makeRepo()
        const cwd = process.cwd()
        try {
            const command = retiredNamed('command')
            const skill = retiredNamed('skill')
            await seedCommand(repo, command)
            await seedSkill(repo, skill)
            await seedCommand(repo, 'my-own.md')

            process.chdir(repo)
            const result = await strayLocalInstallCheck.fix?.()

            expect(result?.errors).toEqual([])
            expect(existsSync(join(repo, '.claude', 'commands', command))).toBe(
                false
            )
            expect(existsSync(join(repo, '.claude', 'skills', skill))).toBe(
                false
            )
            // Moved, not deleted.
            expect(
                existsSync(
                    join(
                        repo,
                        '.claude',
                        '.luca-retired-backup',
                        'commands',
                        command
                    )
                )
            ).toBe(true)
            expect(
                existsSync(
                    join(repo, '.claude', '.luca-retired-backup', 'skills', skill)
                )
            ).toBe(true)
            // Untouched.
            expect(
                existsSync(join(repo, '.claude', 'commands', 'my-own.md'))
            ).toBe(true)
        } finally {
            process.chdir(cwd)
            await rm(repo, { recursive: true, force: true })
        }
    })
})
