import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { FindingResponseSchema } from '../../src/agents/role-results'
import { EngineConfigSchema } from '../../src/config/engine-config'
import {
    JOURNAL_KINDS,
    RunStuckReasonSchema,
    StuckReasonSchema,
} from '../../src/journal/journal-record'

/**
 * The `/luca-retro` skill's text names the engine's words as they are:
 * every `snake_case` word in backticks is a real journal record kind, stuck
 * reason, finding response, or config key. It sorts findings into its six
 * buckets, never edits, checks for a duplicate issue, and asks before it
 * opens one.
 */

const SKILL_FILE = join(import.meta.dir, 'SKILL.md')

/** The engine's words the skill may name in backticks. */
const ENGINE_WORDS = new Set<string>([
    ...JOURNAL_KINDS,
    ...StuckReasonSchema.options,
    ...RunStuckReasonSchema.options,
    ...FindingResponseSchema.shape.response.options,
    ...Object.keys(EngineConfigSchema.shape),
])

/** Every piece of inline code (`...`) in a markdown text. */
const inlineCode = (markdown: string): string[] =>
    [...markdown.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map(
        (match) => match[1] ?? ''
    )

/** A word like `ticket_stuck`: lowercase, with at least one underscore. */
const isSnakeWord = (code: string): boolean => /^[a-z]+(?:_[a-z]+)+$/.test(code)

const skill = await Bun.file(SKILL_FILE).text()

describe('the luca-retro skill', () => {
    test('its frontmatter names it, says when to use it, and takes run ids', () => {
        const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? ''
        expect(frontmatter).toContain('name: luca-retro\n')
        expect(frontmatter).toMatch(/^description: .{100,}$/m)
        expect(frontmatter).toContain('/luca-retro [run id ...]')
        expect(frontmatter).toContain('argument-hint: "[run id ...]"')
        for (const words of [
            'retro',
            'what went wrong in the run',
            'how to stop this happening again',
            'lessons from a run',
        ]) {
            expect(frontmatter).toContain(words)
        }
    })

    test('it is shorter than /luca-unstick', async () => {
        const unstick = await Bun.file(
            join(import.meta.dir, '..', 'luca-unstick', 'SKILL.md')
        ).text()
        expect(skill.length).toBeLessThan(unstick.length)
    })

    test('it runs its helper from where luca init installs it', () => {
        expect(skill).toContain(
            'bun ~/.claude/skills/luca-retro/scripts/retro-summary.ts [run id ...]'
        )
    })

    test('every snake_case word it names in backticks is a real engine word', () => {
        const named = inlineCode(skill).filter(isSnakeWord)
        expect(named.length).toBeGreaterThan(3)
        expect(named.filter((word) => !ENGINE_WORDS.has(word))).toEqual([])
    })

    test('it sorts each finding into the six buckets', () => {
        for (const bucket of [
            '**(a) Check to add**',
            '**(b) Rules line**',
            '**(c) Delete**',
            '**(d) Missing information**',
            '**(e) Waste**',
            '**(f) Luca bug**',
        ]) {
            expect(skill).toContain(bucket)
        }
        expect(skill).toContain('`asibilia/luca-framework`')
    })

    test('it stops for the owner to pick, checks for a duplicate, and asks before opening', () => {
        expect(skill).toMatch(/Nothing happens until the owner picks/)
        expect(skill).toContain(
            'gh issue list --repo <owner/repo> --search "<a few words>" --state all'
        )
        expect(skill).toMatch(/Wait for a yes, then open it/)
        expect(skill).toContain('gh issue create --repo <owner/repo>')
        expect(skill).toMatch(/Never open an issue without the owner's yes/)
    })

    test('it never edits code, rule files, or the journal, and never commits', () => {
        expect(skill).toContain(
            'Never edit code or rule files, and never commit.'
        )
        expect(skill).toContain('Never edit the journal.')
        expect(skill).toMatch(/Never run on your own/)
    })
})
