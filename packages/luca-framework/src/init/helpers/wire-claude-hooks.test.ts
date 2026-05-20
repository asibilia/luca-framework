import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { wireClaudeHooks } from './wire-claude-hooks.ts'

describe('wireClaudeHooks', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-hooks-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('creates .claude/hooks/stage-gate.sh and makes it executable', async () => {
        await wireClaudeHooks({ cwd })

        const hookPath = join(cwd, '.claude/hooks/stage-gate.sh')
        expect(existsSync(hookPath)).toBe(true)

        // chmod +x — owner-execute bit set
        const mode = statSync(hookPath).mode & 0o111
        expect(mode).toBeGreaterThan(0)
    })

    test('stage-gate.sh delegates to the luca CLI', async () => {
        await wireClaudeHooks({ cwd })

        const script = await readFile(
            join(cwd, '.claude/hooks/stage-gate.sh'),
            'utf-8',
        )
        expect(script).toContain('luca hook stage-gate')
    })

    test('creates .claude/settings.json with PreToolUse stage-gate registration', async () => {
        await wireClaudeHooks({ cwd })

        const settingsPath = join(cwd, '.claude/settings.json')
        expect(existsSync(settingsPath)).toBe(true)

        const settings = JSON.parse(await readFile(settingsPath, 'utf-8'))
        expect(settings.hooks).toBeDefined()
        expect(Array.isArray(settings.hooks.PreToolUse)).toBe(true)

        // The stage-gate registration must be present.
        const stageGateRegistration = settings.hooks.PreToolUse.find(
            (entry: { hooks?: Array<{ command?: string }> }) =>
                entry.hooks?.some((h) =>
                    h.command?.includes('stage-gate.sh'),
                ),
        )
        expect(stageGateRegistration).toBeDefined()
    })

    test('merges into existing .claude/settings.json without clobbering', async () => {
        // Set up a pre-existing settings.json with another hook
        await mkdir(join(cwd, '.claude'), { recursive: true })
        await writeFile(
            join(cwd, '.claude/settings.json'),
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
                2,
            ),
        )

        await wireClaudeHooks({ cwd })

        const settings = JSON.parse(
            await readFile(join(cwd, '.claude/settings.json'), 'utf-8'),
        )

        // Pre-existing user key preserved
        expect(settings.someOtherUserKey).toBe('preserved')
        // Pre-existing hook preserved
        const json = JSON.stringify(settings.hooks.PreToolUse)
        expect(json).toContain('existing-hook.sh')
        // Stage-gate now also present
        expect(json).toContain('stage-gate.sh')
    })

    test('is idempotent — re-running does not duplicate the stage-gate entry', async () => {
        await wireClaudeHooks({ cwd })
        await wireClaudeHooks({ cwd })

        const settings = JSON.parse(
            await readFile(join(cwd, '.claude/settings.json'), 'utf-8'),
        )
        const matches = JSON.stringify(settings.hooks.PreToolUse).match(
            /stage-gate\.sh/g,
        )
        expect(matches?.length).toBe(1)
    })
})
