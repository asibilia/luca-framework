import { describe, expect, test } from 'bun:test'

import { handleStageGateHook } from './handle-stage-gate-hook.ts'

describe('handleStageGateHook (Phase 2 — plumbing only)', () => {
    test('returns exit code 0 for a well-formed Edit tool call', async () => {
        const stdin = JSON.stringify({
            tool_name: 'Edit',
            tool_input: { file_path: 'src/foo.ts' },
        })

        const result = await handleStageGateHook({ stdin })

        expect(result.exitCode).toBe(0)
    })

    test('returns exit code 0 for a well-formed Bash tool call', async () => {
        const stdin = JSON.stringify({
            tool_name: 'Bash',
            tool_input: { command: 'ls' },
        })

        const result = await handleStageGateHook({ stdin })

        expect(result.exitCode).toBe(0)
    })

    test('logs the parsed tool name', async () => {
        const logs: string[] = []
        const stdin = JSON.stringify({
            tool_name: 'Write',
            tool_input: { file_path: '/tmp/x' },
        })

        await handleStageGateHook({
            stdin,
            log: (msg) => logs.push(msg),
        })

        const all = logs.join('\n')
        expect(all).toContain('Write')
    })

    test('tolerates empty stdin (returns 0 without crashing)', async () => {
        const result = await handleStageGateHook({ stdin: '' })
        expect(result.exitCode).toBe(0)
    })

    test('tolerates malformed JSON (returns 0, logs warning)', async () => {
        const logs: string[] = []
        const result = await handleStageGateHook({
            stdin: '{not valid json',
            log: (msg) => logs.push(msg),
        })

        expect(result.exitCode).toBe(0)
        expect(logs.join('\n').toLowerCase()).toContain('parse')
    })

    test('camelCase keys (toolName / toolInput) are accepted', async () => {
        // Different Claude Code versions may use camelCase. Accept both.
        const stdin = JSON.stringify({
            toolName: 'Edit',
            toolInput: { file_path: 'x.ts' },
        })

        const result = await handleStageGateHook({ stdin })

        expect(result.exitCode).toBe(0)
        expect(result.toolName).toBe('Edit')
    })
})
