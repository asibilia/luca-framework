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
import { runSetup, type SetupGitHub } from './setup'

import type { MemoryClient } from '../memory/memory-client'
import {
    CLAUDE_JSON,
    createMuninnMcpClient,
    muninnSettings,
} from '../memory/muninn-mcp-client'
import {
    createGitHubTracker,
    ghLogin,
    githubRepoOf,
} from '../tracker/github-tracker'

/**
 * The real GitHub side: the GitHub tracker of the repo at `cwd` for its
 * labels and issue links, and `gh` for the login. With no GitHub repo, the
 * tracker's calls fail with why (setup doesn't make them then).
 */
const githubOf = async ({ cwd }: { cwd: string }): Promise<SetupGitHub> => {
    const name = await githubRepoOf({ repo: cwd }).catch(() => null)
    if (name === null) {
        const fail = () =>
            Promise.reject(new Error(`gh can't find the GitHub repo of ${cwd}`))
        return {
            login: ghLogin,
            githubRepo: async () => null,
            listLabels: fail,
            createLabel: fail,
            issueLinks: fail,
        }
    }
    const tracker = createGitHubTracker({ repo: name })
    return {
        login: ghLogin,
        githubRepo: async () => name,
        listLabels: tracker.listLabels,
        createLabel: tracker.createLabel,
        issueLinks: tracker.issueLinks,
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
            github: await githubOf({ cwd }),
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
