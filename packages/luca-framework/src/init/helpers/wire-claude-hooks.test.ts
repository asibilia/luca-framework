import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { wireClaudeHooks } from './wire-claude-hooks.ts'

describe('wireClaudeHooks', () => {
    let claudeHome: string

    beforeEach(async () => {
        claudeHome = await mkdtemp(join(tmpdir(), 'luca-claude-home-'))
    })

    afterEach(async () => {
        await rm(claudeHome, { recursive: true, force: true })
    })

    test('creates settings.json with a PreToolUse stage-gate registration', async () => {
        await wireClaudeHooks({ claudeHome })

        const settingsPath = join(claudeHome, 'settings.json')
        expect(existsSync(settingsPath)).toBe(true)

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'))
        expect(settings.hooks).toBeDefined()
        expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true)

        // The stage-gate registration must be present.
        const stageGateRegistration = settings.hooks.PreToolUse.find(
            (entry: { hooks?: Array<{ command?: string }> }) =>
                entry.hooks?.some((h) => h.command?.includes('stage-gate'))
        )
        expect(stageGateRegistration).toBeDefined()
    })

    test('registers the bare `luca hook stage-gate` command', async () => {
        await wireClaudeHooks({ claudeHome })

        const settings = JSON.parse(
            await readFile(join(claudeHome, 'settings.json'), 'utf-8')
        )
        expect(JSON.stringify(settings.hooks.PreToolUse)).toContain(
            'luca hook stage-gate'
        )
    })

    test('merges into existing settings.json without clobbering', async () => {
        // Set up a pre-existing settings.json with another hook
        await mkdir(claudeHome, { recursive: true })
        await writeFile(
            join(claudeHome, 'settings.json'),
            JSON.stringify(
                {
                    hooks: {
                        PreToolUse: [
                            {
                                matcher: 'Bash',
                                hooks: [
                                    {
                                        type: 'command',
                                        command: 'existing-hook.sh',
                                    },
                                ],
                            },
                        ],
                    },
                    someOtherUserKey: 'preserved',
                },
                null,
                2
            )
        )

        await wireClaudeHooks({ claudeHome })

        const settings = JSON.parse(
            await readFile(join(claudeHome, 'settings.json'), 'utf-8')
        )

        // Pre-existing user key preserved
        expect(settings.someOtherUserKey).toBe('preserved')
        // Pre-existing hook preserved
        const json = JSON.stringify(settings.hooks.PreToolUse)
        expect(json).toContain('existing-hook.sh')
        // Stage-gate now also present
        expect(json).toContain('luca hook stage-gate')
    })

    test('is idempotent — re-running does not duplicate the stage-gate entry', async () => {
        await wireClaudeHooks({ claudeHome })
        await wireClaudeHooks({ claudeHome })

        const settings = JSON.parse(
            await readFile(join(claudeHome, 'settings.json'), 'utf-8')
        )
        const matches = JSON.stringify(settings.hooks.PreToolUse).match(
            /luca hook stage-gate/g
        )
        expect(matches?.length).toBe(1)
    })
})
