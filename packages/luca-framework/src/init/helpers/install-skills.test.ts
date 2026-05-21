import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { installSkills } from './install-skills.ts'

describe('installSkills', () => {
    let cwd: string
    let skillsSource: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-install-skills-'))
        skillsSource = await mkdtemp(join(tmpdir(), 'luca-skills-source-'))
        await mkdir(join(skillsSource, 'commands'), { recursive: true })
        await mkdir(join(skillsSource, 'agents'), { recursive: true })
        await mkdir(join(skillsSource, 'skills/luca-init'), {
            recursive: true,
        })
        await writeFile(
            join(skillsSource, 'commands/phase-plan.md'),
            '---\nname: phase-plan\n---\nbody'
        )
        await writeFile(
            join(skillsSource, 'agents/luca-executor.md'),
            '---\nname: luca-executor\n---\nbody'
        )
        await writeFile(
            join(skillsSource, 'skills/luca-init/SKILL.md'),
            '---\nname: luca-init\ndescription: seed prefs\n---\nbody'
        )
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
        await rm(skillsSource, { recursive: true, force: true })
    })

    test('copies commands to .claude/commands/', async () => {
        await installSkills({ cwd, skillsSource })

        const target = join(cwd, '.claude/commands/phase-plan.md')
        expect(existsSync(target)).toBe(true)
        const content = await readFile(target, 'utf-8')
        expect(content).toContain('phase-plan')
    })

    test('copies agents to .claude/agents/', async () => {
        await installSkills({ cwd, skillsSource })

        const target = join(cwd, '.claude/agents/luca-executor.md')
        expect(existsSync(target)).toBe(true)
    })

    test('copies skill directories to .claude/skills/<name>/', async () => {
        await installSkills({ cwd, skillsSource })

        const target = join(cwd, '.claude/skills/luca-init/SKILL.md')
        expect(existsSync(target)).toBe(true)
        const content = await readFile(target, 'utf-8')
        expect(content).toContain('luca-init')
    })

    test('is idempotent — re-running does not duplicate or error', async () => {
        await installSkills({ cwd, skillsSource })
        await installSkills({ cwd, skillsSource })

        expect(existsSync(join(cwd, '.claude/commands/phase-plan.md'))).toBe(
            true
        )
    })

    test('preserves user-authored files in .claude/commands/ that are not part of the install set', async () => {
        await mkdir(join(cwd, '.claude/commands'), { recursive: true })
        await writeFile(
            join(cwd, '.claude/commands/my-custom-command.md'),
            'user content'
        )

        await installSkills({ cwd, skillsSource })

        expect(
            existsSync(join(cwd, '.claude/commands/my-custom-command.md'))
        ).toBe(true)
        expect(existsSync(join(cwd, '.claude/commands/phase-plan.md'))).toBe(
            true
        )
    })

    test('overwrites existing skills with the same name (force-updates from package)', async () => {
        await mkdir(join(cwd, '.claude/commands'), { recursive: true })
        await writeFile(
            join(cwd, '.claude/commands/phase-plan.md'),
            'STALE OLD CONTENT'
        )

        await installSkills({ cwd, skillsSource })

        const content = await readFile(
            join(cwd, '.claude/commands/phase-plan.md'),
            'utf-8'
        )
        expect(content).not.toContain('STALE')
        expect(content).toContain('phase-plan')
    })
})
