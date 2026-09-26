#!/usr/bin/env bun
/**
 * `luca-setup`: gets the repo in the current folder ready for Luca. Run it
 * inside the target repo, as often as you like:
 *
 *   bun <luca>/packages/engine/src/cli/luca-setup.ts [--base <branch>]
 *
 * It creates the labels a run needs, writes or converts `.luca/config.json`
 * (a new-style one is left alone), checks the `gh` login, the GitHub remote,
 * sub-issues and issue dependencies, the base branch (default `main`) on
 * `origin`, and the memory vault, and prints what's done and what's left.
 * It never commits. See `runSetup`.
 *
 * Exits 0 when nothing is left to do, 1 when there is, 2 on bad flags.
 */
import { $ } from 'bun'

import { runSetup, type SetupGitHub } from './setup'

import type { MemoryClient } from '../memory/memory-client'
import {
    CLAUDE_JSON,
    createMuninnMcpClient,
    muninnSettings,
} from '../memory/muninn-mcp-client'

/** Calls `gh` in `cwd`; its trimmed stdout, or `null` when it fails. */
const gh = async ({
    cwd,
    args,
}: {
    cwd: string
    args: string[]
}): Promise<string | null> => {
    const result = await $`gh ${args}`.cwd(cwd).quiet().nothrow()
    return result.exitCode === 0 ? result.stdout.toString().trim() : null
}

/**
 * The real GitHub side, through the `gh` CLI. Sub-issues and dependencies
 * are checked on the repo's newest issue; a repo with no issues yet can't
 * show them missing, so both count as there.
 */
const createGhSetupGitHub = ({ cwd }: { cwd: string }): SetupGitHub => {
    const nameOf = async (): Promise<string> => {
        const name = await gh({
            cwd,
            args: [
                'repo',
                'view',
                '--json',
                'nameWithOwner',
                '--jq',
                '.nameWithOwner',
            ],
        })
        if (name === null || name === '') {
            throw new Error(`gh can't find the GitHub repo of ${cwd}`)
        }
        return name
    }
    const works = async (path: string): Promise<boolean> =>
        (await gh({ cwd, args: ['api', path] })) !== null
    return {
        login: async () => {
            const login = await gh({
                cwd,
                args: ['api', 'user', '--jq', '.login'],
            })
            return login === null || login === '' ? null : login
        },
        githubRepo: async () => nameOf().catch(() => null),
        issueLinks: async () => {
            const repo = await nameOf()
            const newest = await gh({
                cwd,
                args: [
                    'api',
                    `repos/${repo}/issues?state=all&per_page=1`,
                    '--jq',
                    '.[0].number // empty',
                ],
            })
            if (newest === null || newest === '') {
                return { sub_issues: true, dependencies: true }
            }
            return {
                sub_issues: await works(
                    `repos/${repo}/issues/${newest}/sub_issues`
                ),
                dependencies: await works(
                    `repos/${repo}/issues/${newest}/dependencies/blocked_by`
                ),
            }
        },
        listLabels: async () => {
            const listed = await gh({
                cwd,
                args: [
                    'label',
                    'list',
                    '--limit',
                    '1000',
                    '--json',
                    'name',
                    '--jq',
                    '.[].name',
                ],
            })
            if (listed === null) throw new Error('gh label list failed')
            return listed.split('\n').filter((name) => name !== '')
        },
        createLabel: async ({ name, color, description }) => {
            const made = await gh({
                cwd,
                args: [
                    'label',
                    'create',
                    name,
                    '--color',
                    color,
                    '--description',
                    description,
                ],
            })
            if (made === null) throw new Error(`gh label create ${name} failed`)
        },
    }
}

/**
 * MuninnDB over MCP, found as `luca-run` finds it. With no settings, a
 * client whose every call fails with why, so the vault check says so.
 */
const memoryOf = async (): Promise<MemoryClient> => {
    const file = Bun.file(CLAUDE_JSON)
    const found = muninnSettings({
        env: process.env,
        claude_json: (await file.exists()) ? await file.text() : null,
    })
    if (found.ok) return createMuninnMcpClient({ settings: found.settings })
    const fail = () => Promise.reject(new Error(found.error))
    return {
        recall: fail,
        remember: fail,
        evolve: fail,
        feedback: fail,
        close: async () => undefined,
    }
}

const parseBase = (argv: string[]): string | null => {
    if (argv.length === 0) return 'main'
    const [flag, base] = argv
    return flag === '--base' &&
        argv.length === 2 &&
        base !== undefined &&
        base !== ''
        ? base
        : null
}

const main = async (): Promise<number> => {
    const base_branch = parseBase(Bun.argv.slice(2))
    if (base_branch === null) {
        console.error('Usage: luca-setup [--base <branch>]')
        return 2
    }
    const cwd = process.cwd()
    const memory = await memoryOf()
    try {
        const end = await runSetup({
            repo: cwd,
            github: createGhSetupGitHub({ cwd }),
            memory,
            base_branch,
            log: (line) => {
                console.log(line)
            },
        })
        return end.ok ? 0 : 1
    } finally {
        await memory.close().catch(() => undefined)
    }
}

process.exit(await main())
