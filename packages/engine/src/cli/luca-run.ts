#!/usr/bin/env bun
/**
 * `luca-run`: the engine's command line. The board plugin launches it as a
 * detached Bun process by absolute path, with stdout pointed at a log file:
 *
 *   bun <abs>/packages/engine/src/cli/luca-run.ts --spec <n> --repo <abs repo>
 *       --run-id <id> --board-plugin luca-board      (token in $LUCA_BOARD_TOKEN)
 *
 * A real run builds with real Claude agents (`createClaudeLauncher`: Claude
 * Opus 5.5, every guard on, paid by your Claude plan) and asks Jev in shadow
 * mode (`createTypeSafeJev`, which reads `TYPESAFE_API_KEY`; with no key each
 * ask is journaled as `missing_key` and the run goes on). Memory (#370) is
 * MuninnDB over MCP, found through `LUCA_MUNINN_URL` and `LUCA_MUNINN_TOKEN`
 * or Claude Code's `mcpServers.muninn` in `~/.claude.json`; with neither,
 * the run goes on without memory.
 *
 * `--demo` runs a practice spec in a throwaway repo instead: no GitHub, no
 * models. `--resume <run-id>` goes on with a run from its journal, in the
 * repo it started in (or `--repo`). See `RUN_USAGE` for every flag.
 *
 * Exits 0 when the run finished (PR opened, or nothing to do), 1 when it
 * stopped (refused, stuck, stopped by the launcher, crashed, or a resume with
 * no journal to go on from), 2 on bad flags.
 */
import { $ } from 'bun'

import { parseRunArgs, type RunArgs } from './run-args'
import {
    DEMO_TURN_DELAY_MS,
    resumeRun,
    runDemo,
    runSpec,
    type RunEnd,
} from './run-modes'

import { createClaudeLauncher } from '../agents/claude-launcher'
import { createBoardSync, type BoardSync } from '../board/board-sync'
import { createPaseoBoardLink } from '../board/paseo-board-link'
import { createTypeSafeJev } from '../jev/jev-client'
import { defaultRunsDir } from '../journal/journal'
import type { MemoryDeps } from '../memory/memory-client'
import {
    CLAUDE_JSON,
    createMuninnMcpClient,
    muninnSettings,
} from '../memory/muninn-mcp-client'
import { createGitHubTracker } from '../tracker/github-tracker'

const log = (line: string) => {
    console.log(line)
}

/** The repo's GitHub `owner/name`, from `gh` run inside it. */
const githubRepoOf = async ({ repo }: { repo: string }): Promise<string> => {
    const result =
        await $`gh repo view --json nameWithOwner --jq .nameWithOwner`
            .cwd(repo)
            .quiet()
            .nothrow()
    const name = result.stdout.toString().trim()
    if (result.exitCode !== 0 || name === '') {
        throw new Error(
            `Could not find the GitHub repo of ${repo} with gh: ${result.stderr.toString().trim()}`
        )
    }
    return name
}

/**
 * The run's memory client, or none (the run goes on without memory) when
 * MuninnDB can't be found. Logs where it connects, never the token.
 */
const memoryOf = async (): Promise<MemoryDeps | undefined> => {
    const file = Bun.file(CLAUDE_JSON)
    const found = muninnSettings({
        env: process.env,
        claude_json: (await file.exists()) ? await file.text() : null,
    })
    if (!found.ok) {
        log(`[luca-run] memory off: ${found.error}`)
        return undefined
    }
    log(`[luca-run] memory: MuninnDB at ${found.settings.url}`)
    return { client: createMuninnMcpClient({ settings: found.settings }) }
}

const run = async ({
    args,
    board,
}: {
    args: RunArgs
    board: BoardSync | null
}): Promise<RunEnd> => {
    if (args.mode === 'demo') {
        const end = await runDemo({
            run_id: args.run_id,
            board,
            log,
            turn_delay_ms: DEMO_TURN_DELAY_MS,
        })
        for (const pull of end.pull_requests) {
            log(`[luca-run] demo PR #${pull.number} (in memory): ${pull.title}`)
            log(pull.body)
        }
        return end
    }
    if (args.mode === 'resume') {
        return resumeRun({
            run_id: args.run_id,
            runs_dir: defaultRunsDir(),
            repo: args.repo,
            tracker: async ({ repo }) =>
                createGitHubTracker({ repo: await githubRepoOf({ repo }) }),
            launcher: createClaudeLauncher({}),
            jev: { client: createTypeSafeJev() },
            board,
            log,
        })
    }
    const tracker = createGitHubTracker({
        repo: await githubRepoOf({ repo: args.repo }),
    })
    return runSpec({
        spec_number: args.spec_number,
        repo: args.repo,
        run_id: args.run_id,
        base_branch: args.base_branch,
        runs_dir: defaultRunsDir(),
        tracker,
        launcher: createClaudeLauncher({}),
        jev: { client: createTypeSafeJev() },
        memory: await memoryOf(),
        board,
        log,
    })
}

const main = async (): Promise<number> => {
    const parsed = parseRunArgs({
        argv: Bun.argv.slice(2),
        cwd: process.cwd(),
        env: process.env,
    })
    if (!parsed.ok) {
        console.error(parsed.error)
        return 2
    }
    const { args } = parsed
    const board =
        args.board === null
            ? null
            : createBoardSync({
                  link: createPaseoBoardLink({
                      plugin_id: args.board.plugin_id,
                      run_id: args.run_id,
                      token: args.board.token,
                  }),
                  log,
              })
    try {
        const end = await run({ args, board })
        return end.ok ? 0 : 1
    } catch (error) {
        // Only setup (such as finding the GitHub repo) gets here; the run
        // modes catch their own crashes and end the board themselves.
        const message = error instanceof Error ? error.message : String(error)
        log(`[luca-run] stopped: ${message}`)
        await board?.end({ ok: false, message })
        return 1
    }
}

process.exit(await main())
