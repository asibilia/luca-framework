import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { roleInstructions } from './role-instructions'
import { AgentRoleSchema, LENS_ROLES } from './role-results'
import { STORY_FORMAT_PATH } from './story-writer-instructions'

import { EngineConfigSchema } from '../config/engine-config'
import {
    StoryChangeSchema,
    StoryFlagSchema,
    StoryMapSchema,
    StoryStopSchema,
    StorySummarySchema,
} from '../story/story-parts'
import { StorySchema } from '../story/story-schema'
import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

const BASE_CONFIG = EngineConfigSchema.parse(PRACTICE_ENGINE_CONFIG)

const keysOf = (schema: z.ZodType): string[] => {
    const json = z.toJSONSchema(schema, { io: 'input' })
    const walk = (value: unknown): string[] => {
        if (Array.isArray(value)) return value.flatMap(walk)
        if (typeof value !== 'object' || value === null) return []
        return Object.entries(value).flatMap(([key, inner]) =>
            key === 'properties' && typeof inner === 'object' && inner !== null
                ? [...Object.keys(inner), ...walk(inner)]
                : walk(inner)
        )
    }
    return [...new Set(walk(json))]
}

describe('Tier 1 — agy-aware role instructions', () => {
    test('omits ## Helpers across all 10 AgentRoles when provider is "agy"', () => {
        for (const role of AgentRoleSchema.options) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: BASE_CONFIG,
                messaging: false,
                provider: 'agy',
            })
            expect(text).not.toContain('## Helpers')
            expect(text).not.toContain('subagent_type: "searcher"')
        }
    })

    test('provider "agy" with messaging false omits ## Agent messages for writers while keeping core sections', () => {
        const implementer = roleInstructions({
            role: 'implementer',
            may_edit_tests: false,
            config: BASE_CONFIG,
            messaging: false,
            provider: 'agy',
        })
        expect(implementer).toContain('# Your role: implementer')
        expect(implementer).toContain('## Shell')
        expect(implementer).toContain('## Your sandbox')
        expect(implementer).toContain('## Rules for every agent')
        expect(implementer).not.toContain('## Helpers')
        expect(implementer).not.toContain('## Agent messages')
        expect(implementer).not.toContain('send_message')

        const testWriter = roleInstructions({
            role: 'test-writer',
            may_edit_tests: true,
            config: BASE_CONFIG,
            messaging: false,
            provider: 'agy',
        })
        expect(testWriter).toContain('# Your role: test-writer')
        expect(testWriter).toContain('## Shell')
        expect(testWriter).toContain('## Your sandbox')
        expect(testWriter).toContain('## Rules for every agent')
        expect(testWriter).not.toContain('## Helpers')
        expect(testWriter).not.toContain('## Agent messages')
    })

    test('provider "agy" keeps task, shell, sandbox, and common sections for ticket-reviewer and all 5 lenses', () => {
        for (const role of ['ticket-reviewer', ...LENS_ROLES] as const) {
            const text = roleInstructions({
                role,
                may_edit_tests: false,
                config: BASE_CONFIG,
                provider: 'agy',
            })
            expect(text).not.toContain('## Helpers')
            expect(text).not.toContain('## Agent messages')
            expect(text).toContain('## Shell')
            expect(text).toContain('## Your sandbox')
            expect(text).toContain('## Rules for every agent')
        }
    })

    test('learner on provider "agy" uses agy read/search tools and omits Claude tools and Helpers', () => {
        const text = roleInstructions({
            role: 'learner',
            may_edit_tests: false,
            config: BASE_CONFIG,
            provider: 'agy',
        })
        expect(text).toContain(
            'You may read the repo (view_file, grep_search, find_by_name, list_dir) to check a lesson. You have no shell, and you write nothing.'
        )
        expect(text).not.toContain('Read, Grep, Glob')
        expect(text).not.toContain('## Helpers')
        expect(text).not.toContain('## Agent messages')
        expect(text).not.toContain('## Shell')
        expect(text).toContain('## Your sandbox')
        expect(text).toContain('## Rules for the learner')
    })

    test('story-writer on provider "agy" uses agy read/search tools and keeps story-format.md verbatim', async () => {
        const format = (await Bun.file(STORY_FORMAT_PATH).text()).trim()
        const text = roleInstructions({
            role: 'story-writer',
            may_edit_tests: false,
            config: BASE_CONFIG,
            provider: 'agy',
        })
        expect(text).toContain(
            'with view_file, grep_search, find_by_name and list_dir.'
        )
        expect(text).not.toContain('Read, Grep and Glob')
        expect(text).not.toContain('## Helpers')
        expect(text).not.toContain('## Agent messages')
        expect(text).not.toContain('## Shell')
        expect(text).toContain(format)
        expect(text).toContain('## Your sandbox')
        expect(text).toContain('## Rules for the story-writer')
    })

    test('omitted provider and provider "claude" produce identical baseline output across all 10 roles', () => {
        for (const role of AgentRoleSchema.options) {
            const omitted = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: BASE_CONFIG,
            })
            const explicit = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: BASE_CONFIG,
                provider: 'claude',
            })
            expect(explicit).toBe(omitted)
            expect(omitted).toContain('## Helpers')
        }
        const learner = roleInstructions({
            role: 'learner',
            may_edit_tests: false,
            config: BASE_CONFIG,
            provider: 'claude',
        })
        expect(learner).toContain('Read, Grep, Glob')
        const story = roleInstructions({
            role: 'story-writer',
            may_edit_tests: false,
            config: BASE_CONFIG,
            provider: 'claude',
        })
        expect(story).toContain('with Read, Grep and Glob.')
        const implementer = roleInstructions({
            role: 'implementer',
            may_edit_tests: false,
            config: BASE_CONFIG,
            provider: 'claude',
        })
        expect(implementer).toContain('## Agent messages')
    })
})

describe('Tier 2 — agy role instruction boundaries and invariants', () => {
    test('omitting HELPERS and MESSAGES under provider "agy" joins cleanly without triple newlines or edge blanks', () => {
        const withRules = EngineConfigSchema.parse({
            ...PRACTICE_ENGINE_CONFIG,
            rule_files: ['AGENTS.md'],
        })
        for (const config of [BASE_CONFIG, withRules]) {
            for (const role of AgentRoleSchema.options) {
                const text = roleInstructions({
                    role,
                    may_edit_tests: role === 'test-writer',
                    config,
                    messaging: false,
                    provider: 'agy',
                })
                expect(text).not.toContain('\n\n\n')
                expect(text.startsWith('\n')).toBe(false)
                expect(text.endsWith('\n')).toBe(false)
            }
        }
    })

    test('learner and story-writer on provider "agy" never receive ## Agent messages even when messaging is true', () => {
        for (const role of ['learner', 'story-writer'] as const) {
            const text = roleInstructions({
                role,
                may_edit_tests: false,
                config: BASE_CONFIG,
                messaging: true,
                provider: 'agy',
            })
            expect(text).not.toContain('## Agent messages')
            expect(text).not.toContain('send_message')
            expect(text).not.toContain('## Helpers')
        }
    })

    test('provider "agy" keeps messaging orthogonal for writers when messaging is explicitly true', () => {
        const withMsg = roleInstructions({
            role: 'implementer',
            may_edit_tests: false,
            config: BASE_CONFIG,
            messaging: true,
            provider: 'agy',
        })
        expect(withMsg).toContain('## Agent messages')
        expect(withMsg).not.toContain('## Helpers')

        const reviewer = roleInstructions({
            role: 'ticket-reviewer',
            may_edit_tests: false,
            config: BASE_CONFIG,
            provider: 'agy',
        })
        expect(reviewer).not.toContain('## Agent messages')
    })

    test('provider "agy" retains ## Repo rules and may_edit_tests refactor permissions', () => {
        const withRules = EngineConfigSchema.parse({
            ...PRACTICE_ENGINE_CONFIG,
            rule_files: ['AGENTS.md', 'docs/guides/coding-standards.md'],
        })
        const refactor = roleInstructions({
            role: 'implementer',
            may_edit_tests: true,
            config: withRules,
            messaging: false,
            provider: 'agy',
        })
        expect(refactor).toContain('## Repo rules')
        expect(refactor).toContain('- `AGENTS.md`')
        expect(refactor).toContain('- `docs/guides/coding-standards.md`')
        expect(refactor).toContain(
            'You may follow renames and moves into test files'
        )
        expect(refactor).not.toContain('## Helpers')
        expect(refactor).not.toContain('## Agent messages')

        const normal = roleInstructions({
            role: 'implementer',
            may_edit_tests: false,
            config: withRules,
            messaging: false,
            provider: 'agy',
        })
        expect(normal).toContain('Never create, edit, or delete a test file')
    })

    test('story-writer on provider "agy" still names every StorySchema key in its embedded field guide', async () => {
        const format = (
            await Bun.file(
                join(
                    import.meta.dir,
                    '../../skills/luca-pr-prep/references/story-format.md'
                )
            ).text()
        ).trim()
        const text = roleInstructions({
            role: 'story-writer',
            may_edit_tests: false,
            config: BASE_CONFIG,
            provider: 'agy',
        })
        const guide = text.slice(text.indexOf(format))
        const named = new Set(
            [...guide.matchAll(/`([^`\n]+)`/g)].flatMap(
                (match) => match[1]?.match(/[a-z0-9_]+/g) ?? []
            )
        )
        const keys = [
            StorySchema,
            StorySummarySchema,
            StoryMapSchema,
            StoryStopSchema,
            StoryChangeSchema,
            StoryFlagSchema,
        ].flatMap(keysOf)

        expect(keys.length).toBeGreaterThan(20)
        expect(keys.filter((key) => !named.has(key))).toEqual([])
    })
})
