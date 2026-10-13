import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
    ImplementerResultSchema,
    TestWriterResultSchema,
} from '../../src/agents/role-results'
import { EngineConfigSchema } from '../../src/config/engine-config'
import {
    AgentFailureSchema,
    JOURNAL_KINDS,
    ReplyProblemSchema,
    ReplyWordSchema,
    RunStuckReasonSchema,
    StuckReasonSchema,
} from '../../src/journal/journal-record'

/**
 * The `/luca-unstick` skill's text names the engine's words as they are:
 * every `snake_case` word in backticks is a real journal record kind, stuck
 * reason, reply problem, agent result, failure kind, or config key. And its
 * playbook covers every stuck reason. So a renamed or new record kind or
 * reason fails here until the skill says it too.
 */

const SKILL_FILE = join(import.meta.dir, 'SKILL.md')

/** The engine's words the skill may name in backticks. */
const ENGINE_WORDS = new Set<string>([
    ...JOURNAL_KINDS,
    ...StuckReasonSchema.options,
    ...RunStuckReasonSchema.options,
    ...ReplyProblemSchema.options,
    ...AgentFailureSchema.options,
    ...TestWriterResultSchema.shape.outcome.options,
    ...ImplementerResultSchema.shape.outcome.options,
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

describe('the luca-unstick skill', () => {
    test('its frontmatter names it and says when to use it', () => {
        const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(skill)?.[1] ?? ''
        expect(frontmatter).toContain('name: luca-unstick\n')
        expect(frontmatter).toMatch(/^description: .{100,}$/m)
        expect(frontmatter).toContain('/luca-unstick [run id] [#ticket]')
    })

    test('every snake_case word it names in backticks is a real engine word', () => {
        const named = inlineCode(skill).filter(isSnakeWord)
        expect(named.length).toBeGreaterThan(20)
        expect(named.filter((word) => !ENGINE_WORDS.has(word))).toEqual([])
    })

    test('its playbook covers every stuck reason', () => {
        const named = new Set(inlineCode(skill))
        const reasons = [
            ...StuckReasonSchema.options,
            ...RunStuckReasonSchema.options,
        ]
        expect(reasons.filter((reason) => !named.has(reason))).toEqual([])
    })

    test('it names every reply word', () => {
        const named = inlineCode(skill).join('\n')
        for (const word of ReplyWordSchema.options) {
            expect(named).toContain(word)
        }
    })

    test('it names the records that say the engine took a reply', () => {
        const named = new Set(inlineCode(skill))
        for (const kind of [
            'stuck_reported',
            'reply_received',
            'reply_ignored',
            'ticket_retried',
            'ticket_skipped',
            'final_review_retried',
            'final_review_shipped',
        ]) {
            expect(named.has(kind)).toBe(true)
        }
    })

    test('it posts the reply with gh issue comment, after asking, as the spec owner', () => {
        expect(skill).toContain('gh issue comment <spec> --repo <owner/repo>')
        expect(skill).toContain('gh api user --jq .login')
        expect(skill).toMatch(/Wait for a yes/)
    })

    test('it runs its helper from where luca init installs it', () => {
        expect(skill).toContain(
            'bun ~/.claude/skills/luca-unstick/scripts/stuck-summary.ts'
        )
    })
})
