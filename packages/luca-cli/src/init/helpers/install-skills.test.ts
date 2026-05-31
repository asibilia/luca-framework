import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { installSkills } from './install-skills.ts'

describe('installSkills', () => {
    let claudeHome: string
    let distClaude: string
    let claudeArtifactsRoot: string
    let skillsRoot: string

    beforeEach(async () => {
        claudeHome = await mkdtemp(join(tmpdir(), 'luca-claude-home-'))
        // F-2: mirror the umbrella's bundled-artifacts layout — commands
        // and agents under `<dist/claude>/.claude/`, skills under
        // `<dist/claude>/skills/`. The compiler emits both as siblings
        // of `<outputRoot>`.
        distClaude = await mkdtemp(join(tmpdir(), 'luca-dist-claude-'))
        claudeArtifactsRoot = join(distClaude, '.claude')
        skillsRoot = join(distClaude, 'skills')
        await mkdir(join(claudeArtifactsRoot, 'commands'), { recursive: true })
        await mkdir(join(claudeArtifactsRoot, 'agents'), { recursive: true })
        await mkdir(join(skillsRoot, 'luca-init'), { recursive: true })
        await writeFile(
            join(claudeArtifactsRoot, 'commands/phase-plan.md'),
            '---\nname: phase-plan\n---\nbody'
        )
        await writeFile(
            join(claudeArtifactsRoot, 'agents/luca-executor.md'),
            '---\nname: luca-executor\n---\nbody'
        )
        await writeFile(
            join(skillsRoot, 'luca-init/SKILL.md'),
            '---\nname: luca-init\ndescription: seed prefs\n---\nbody'
        )
    })

    afterEach(async () => {
        await rm(claudeHome, { recursive: true, force: true })
        await rm(distClaude, { recursive: true, force: true })
    })

    test('copies commands to <claudeHome>/commands/', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const target = join(claudeHome, 'commands/phase-plan.md')
        expect(existsSync(target)).toBe(true)
        const content = await readFile(target, 'utf-8')
        expect(content).toContain('phase-plan')
    })

    test('copies agents to <claudeHome>/agents/', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const target = join(claudeHome, 'agents/luca-executor.md')
        expect(existsSync(target)).toBe(true)
    })

    test('copies skill directories to <claudeHome>/skills/<name>/', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const target = join(claudeHome, 'skills/luca-init/SKILL.md')
        expect(existsSync(target)).toBe(true)
        const content = await readFile(target, 'utf-8')
        expect(content).toContain('luca-init')
    })

    test('is idempotent — re-running does not duplicate or error', async () => {
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })
        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        expect(existsSync(join(claudeHome, 'commands/phase-plan.md'))).toBe(true)
    })

    test('preserves user-authored files not part of the install set', async () => {
        await mkdir(join(claudeHome, 'commands'), { recursive: true })
        await writeFile(
            join(claudeHome, 'commands/my-custom-command.md'),
            'user content'
        )

        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        expect(
            existsSync(join(claudeHome, 'commands/my-custom-command.md'))
        ).toBe(true)
        expect(existsSync(join(claudeHome, 'commands/phase-plan.md'))).toBe(true)
    })

    test('overwrites existing skills with the same name (force-updates from package)', async () => {
        await mkdir(join(claudeHome, 'commands'), { recursive: true })
        await writeFile(
            join(claudeHome, 'commands/phase-plan.md'),
            'STALE OLD CONTENT'
        )

        await installSkills({ claudeHome, claudeArtifactsRoot, skillsRoot })

        const content = await readFile(
            join(claudeHome, 'commands/phase-plan.md'),
            'utf-8'
        )
        expect(content).not.toContain('STALE')
        expect(content).toContain('phase-plan')
    })
})
