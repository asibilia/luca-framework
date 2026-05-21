import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { lucaBranchGuardTool } from './luca-branch-guard.ts'

async function runGit(cwd: string, args: string[]): Promise<void> {
    const proc = Bun.spawn(['git', ...args], {
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    })
    const code = await proc.exited
    if (code !== 0) {
        const stderr = await new Response(proc.stderr).text()
        throw new Error(`git ${args.join(' ')} failed: ${stderr}`)
    }
}

async function initRepoOnBranch(cwd: string, branch: string): Promise<void> {
    await runGit(cwd, ['init', '-q', '-b', branch])
    await runGit(cwd, ['config', 'user.email', 'test@example.com'])
    await runGit(cwd, ['config', 'user.name', 'Test'])
    await runGit(cwd, ['commit', '--allow-empty', '-q', '-m', 'init'])
}

describe('luca_branch_guard', () => {
    let cwd: string

    beforeEach(async () => {
        cwd = await mkdtemp(join(tmpdir(), 'luca-mcp-branch-guard-'))
    })

    afterEach(async () => {
        await rm(cwd, { recursive: true, force: true })
    })

    test('ok=true when current branch differs from default', async () => {
        await initRepoOnBranch(cwd, 'feature-x')

        const r = await lucaBranchGuardTool.handler(
            { default_branch: 'main' },
            { cwd }
        )

        expect(r.isError).toBeFalsy()
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.ok).toBe(true)
        expect(parsed.current).toBe('feature-x')
        expect(parsed.default).toBe('main')
    })

    test('returns isError when current branch equals default', async () => {
        await initRepoOnBranch(cwd, 'main')

        const r = await lucaBranchGuardTool.handler(
            { default_branch: 'main' },
            { cwd }
        )

        expect(r.isError).toBe(true)
        const parsed = JSON.parse((r.content[0] as { text: string }).text)
        expect(parsed.ok).toBe(false)
        expect(parsed.current).toBe('main')
        expect(parsed.default).toBe('main')
    })

    test('default_branch schema default is "main" when omitted', async () => {
        await initRepoOnBranch(cwd, 'main')

        const parsed = lucaBranchGuardTool.inputSchema.parse({})
        const r = await lucaBranchGuardTool.handler(parsed, { cwd })

        expect(r.isError).toBe(true)
        const body = JSON.parse((r.content[0] as { text: string }).text)
        expect(body.default).toBe('main')
    })

    test('returns isError when not a git repo', async () => {
        const r = await lucaBranchGuardTool.handler(
            { default_branch: 'main' },
            { cwd }
        )

        expect(r.isError).toBe(true)
    })

    test('has no allowedPhases (callable in any phase)', () => {
        expect(lucaBranchGuardTool.allowedPhases).toBeUndefined()
    })
})
