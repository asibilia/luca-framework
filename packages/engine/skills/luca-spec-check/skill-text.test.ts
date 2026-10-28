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

    test('it names its three readers: Comprehension, Readiness and Codebase', () => {
        for (const reader of ['Comprehension', 'Readiness', 'Codebase']) {
            expect(skill).toContain(reader)
        }
    })

    test('its readers are read-only and get no conversation history', () => {
        expect(skill).toMatch(/no conversation history/i)
        expect(skill).toMatch(/read-only/)
    })

    test('its report has the exact headings and lines', () => {
        for (const line of [
            '## Spec check',
            '### How a fresh reader read it',
            '### Blockers',
            '### Questions',
            'No blockers.',
            'No questions.',
            'They found nothing to fix.',
            'This check only advises. Fix the spec, then run /luca-spec-check again.',
        ]) {
            expect(skill).toContain(line)
        }
    })

    test('its report has the count line example', () => {
        expect(skill).toContain(
            'Three fresh readers checked this spec and its 3 tickets. They found 2 blockers and 5 questions.'
        )
    })

    test('its findings start with the reader and the ticket', () => {
        expect(skill).toContain('**Comprehension:**')
        expect(skill).toContain('**Codebase:**')
        expect(skill).toContain('**Readiness, #670:**')
    })

    test('it asks before posting, and never edits the spec, touches a label, or commits', () => {
        expect(skill).toContain('Post this on #678?')
        expect(skill).toContain('gh issue comment')
        expect(skill).toMatch(/only after (?:a|the owner's) yes/)
        expect(skill).toMatch(/Never edit the spec/)
        expect(skill).toMatch(/Never add or remove a label/)
        expect(skill).toMatch(/never commit/i)
    })

    test('with its readers and report, it is still shorter than /luca-unstick', async () => {
        const unstick = await Bun.file(
            join(import.meta.dir, '..', 'luca-unstick', 'SKILL.md')
        ).text()
        expect(skill).toContain('### Questions')
        expect(skill).toContain('Post this on #678?')
        expect(skill.length).toBeLessThan(unstick.length)
    })

    test('the run-control feature map lists it, its two test files, and the report they check', async () => {
        const page = await Bun.file(
            join(
                import.meta.dir,
                '..',
                '..',
                '..',
                '..',
                'docs',
                'feature-map',
                'run-control.md'
            )
        ).text()
        expect(page).toContain('/luca-spec-check [spec issue number]')
        expect(page).toContain(
            'packages/engine/skills/luca-spec-check/skill-text.test.ts'
        )
        expect(page).toContain(
            'packages/engine/skills/luca-spec-check/scripts/spec-bundle.test.ts'
        )
        expect(skill).toContain('## Spec check')
    })
})
