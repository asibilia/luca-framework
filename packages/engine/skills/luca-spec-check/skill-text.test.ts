import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { lucaSkills } from '../../src/cli/luca-skills'

/**
 * The `/luca-spec-check` skill's text: its frontmatter names it, takes a
 * spec issue number, and lists its trigger phrases, and it runs its gather
 * script from where `luca init` installs it.
 */

const SKILL_FILE = join(import.meta.dir, 'SKILL.md')

const skill = await Bun.file(SKILL_FILE).text()

describe('the luca-spec-check skill', () => {
    test('it is one of Luca skills, beside /luca-retro and /luca-unstick', async () => {
        const skills = await lucaSkills({
            skills_dir: join(import.meta.dir, '..'),
        })
        expect(skills).toContain('luca-retro')
        expect(skills).toContain('luca-spec-check')
        expect(skills).toContain('luca-unstick')
    })

    test('its frontmatter names it, takes a spec issue number, and lists its trigger phrases', () => {
        const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? ''
        expect(frontmatter).toContain('name: luca-spec-check\n')
        expect(frontmatter).toContain('argument-hint: "[spec issue number]"')
        const description = /^description: (.*)$/m.exec(frontmatter)?.[1] ?? ''
        expect(description.length).toBeGreaterThanOrEqual(100)
        for (const phrase of [
            'check this spec',
            'is this spec ready',
            'spec check',
            'cold read',
            'goldfish',
        ]) {
            expect(description).toContain(phrase)
        }
    })

    test('it runs its gather script from where luca init installs it', () => {
        expect(skill).toContain(
            'bun ~/.claude/skills/luca-spec-check/scripts/spec-bundle.ts'
        )
    })
})
