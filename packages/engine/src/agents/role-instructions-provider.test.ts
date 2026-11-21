import { describe, expect, test } from 'bun:test'

import { LEARNER, LEARNER_RULES } from './learner-instructions'
import { roleInstructions } from './role-instructions'
import { AgentRoleSchema } from './role-results'
import {
    STORY_WRITER,
    STORY_WRITER_RULES,
    storyFormat,
} from './story-writer-instructions'

import { PRACTICE_ENGINE_CONFIG } from '../testing/practice-repo'

describe('AC7: provider-aware roleInstructions', () => {
    test('default and explicit claude provider produce byte-for-byte identical instructions across all roles', () => {
        for (const role of AgentRoleSchema.options) {
            for (const messaging of [undefined, true, false] as const) {
                const omitted = roleInstructions({
                    role,
                    may_edit_tests: role === 'test-writer',
                    config: PRACTICE_ENGINE_CONFIG,
                    messaging,
                })
                const explicit = roleInstructions({
                    role,
                    may_edit_tests: role === 'test-writer',
                    config: PRACTICE_ENGINE_CONFIG,
                    messaging,
                    provider: 'claude',
                })
                expect(omitted).toBe(explicit)
            }
        }
        expect(LEARNER).toContain('(Read, Grep, Glob)')
        expect(STORY_WRITER).toContain('with Read, Grep and Glob.')
    })

    test('provider agy with messaging false omits HELPERS and MESSAGES across every role', () => {
        for (const role of AgentRoleSchema.options) {
            const text = roleInstructions({
                role,
                may_edit_tests: role === 'test-writer',
                config: PRACTICE_ENGINE_CONFIG,
                messaging: false,
                provider: 'agy',
            })
            expect(text).not.toContain('## Helpers')
            expect(text).not.toContain('searcher')
            expect(text).not.toContain('## Agent messages')
            expect(text).not.toContain('send_message')
            expect(text).toContain('## Your sandbox')
        }
    })

    test('provider agy substitutes agy read/search tools in learner and story-writer instructions', () => {
        const learner = roleInstructions({
            role: 'learner',
            may_edit_tests: false,
            config: PRACTICE_ENGINE_CONFIG,
            messaging: false,
            provider: 'agy',
        })
        expect(learner).toContain(
            'You may read the repo (view_file, grep_search, find_by_name, list_dir) to check a lesson. You have no shell, and you write nothing.'
        )
        expect(learner).not.toContain('Read, Grep, Glob')
        expect(learner).toContain(LEARNER_RULES)

        const story_writer = roleInstructions({
            role: 'story-writer',
            may_edit_tests: false,
            config: PRACTICE_ENGINE_CONFIG,
            messaging: false,
            provider: 'agy',
        })
        expect(story_writer).toContain(
            'with view_file, grep_search, find_by_name and list_dir.'
        )
        expect(story_writer).not.toContain('Read, Grep and Glob')
        expect(story_writer).toContain(`You have no shell. You write nothing.`)
        expect(story_writer).toContain(storyFormat().trim())
        expect(story_writer).toContain(STORY_WRITER_RULES)
    })
})
