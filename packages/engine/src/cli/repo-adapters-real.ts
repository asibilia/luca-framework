/**
 * The real repo adapters `luca setup` and `luca doctor` share: the repo's
 * GitHub side, and MuninnDB over MCP for its vault.
 */
import type { SetupGitHub } from './setup'

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
export const githubOf = async ({
    cwd,
}: {
    cwd: string
}): Promise<SetupGitHub> => {
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
export const memoryOf = async (): Promise<MemoryClient> => {
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
