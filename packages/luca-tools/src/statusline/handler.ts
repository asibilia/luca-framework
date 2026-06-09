#!/usr/bin/env bun
/**
 * luca-statusline handler — Claude Code `statusLine` command.
 *
 * Renders a single-line footer for the Claude Code TUI:
 *
 *   Fable 5 │ luca-framework ⎇ main* │ ██████░░░░ 58% 580k/1M │ luca:execute 3/4 │ +120/-45
 *
 * Segments (each omitted when its data source is unavailable):
 *   1. Model display name.
 *   2. Repo name + git branch, with a `*` marker when the worktree is dirty.
 *   3. Context-window usage as a 10-slot bar chart + percent + token counts.
 *      Color shifts green → yellow (≥60%) → red (≥80%).
 *   4. Luca pipeline step + phase progress, read from `.luca/state.json`
 *      when the current project is a luca-managed repo.
 *   5. Session line delta (+added/-removed) from the harness cost payload.
 *
 * The Claude Code statusLine contract:
 *   - Invoked with a JSON payload on stdin (snake_case fields):
 *       {
 *         "session_id": "...",
 *         "transcript_path": "/path/to/session.jsonl",
 *         "cwd": "...",
 *         "model": { "id": "claude-...", "display_name": "..." },
 *         "workspace": { "current_dir": "...", "project_dir": "..." },
 *         "cost": { "total_lines_added": 0, "total_lines_removed": 0, ... }
 *       }
 *   - The first line of stdout becomes the status line.
 *   - ANSI color escapes are supported.
 *
 * Context usage: the payload does not carry token usage directly, so we
 * derive it from the session transcript — the most recent main-chain
 * assistant entry's `message.usage` (input + cache_read + cache_creation)
 * is the prompt size of the last API turn, i.e. current context
 * occupancy. Only the transcript tail (256 KiB) is read so the handler
 * stays cheap on long sessions (statusLine fires on every TUI update,
 * debounced to ~300ms). The window size is inferred from the model id:
 * a `[1m]` suffix means a 1M-token window, anything else 200k.
 *
 * Failure philosophy: a statusline must never break the session. Every
 * data source is best-effort — on any parse/spawn/read error the segment
 * is dropped (or the whole line degrades to just the model name). The
 * process always exits 0.
 *
 * Why a bun-script: matches the hook-handler delivery pattern — bundled
 * self-contained by `bun build --target bun` at umbrella build time
 * (see `packages/luca/build.config.ts`), installed to
 * `~/.claude/luca-statusline.ts` by `luca init` (see
 * `packages/luca-cli/src/init/helpers/install-statusline.ts`).
 */
import { existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

// ─── ANSI palette ────────────────────────────────────────────────────────────

const RESET = '\x1b[0m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const BLUE = '\x1b[34m'
const MAGENTA = '\x1b[35m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'

const SEPARATOR = ` ${DIM}│${RESET} `

// ─── Payload shape (defensive subset) ────────────────────────────────────────

/**
 * The slice of the statusLine stdin payload this handler reads. The
 * harness may add fields at any time; everything unknown is ignored.
 */
interface StatuslinePayload {
    transcript_path?: string
    cwd?: string
    model?: {
        id?: string
        display_name?: string
    }
    workspace?: {
        current_dir?: string
        project_dir?: string
    }
    cost?: {
        total_lines_added?: number
        total_lines_removed?: number
    }
}

// ─── Segment builders ────────────────────────────────────────────────────────

/**
 * Run a git subcommand in `dir` and return trimmed stdout, or null on
 * any failure (not a repo, git missing, non-zero exit).
 */
function runGit(dir: string, args: string[]): string | null {
    try {
        const result = Bun.spawnSync(['git', '-C', dir, ...args], {
            stdout: 'pipe',
            stderr: 'ignore',
            stdin: 'ignore',
        })
        if (result.exitCode !== 0) return null
        return result.stdout.toString().trim()
    } catch {
        return null
    }
}

/**
 * Build the `repo ⎇ branch*` segment. Returns null when `dir` is not
 * inside a git repository.
 */
function gitSegment(dir: string): string | null {
    const branch = runGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    if (branch === null) return null
    const toplevel = runGit(dir, ['rev-parse', '--show-toplevel'])
    const repo = basename(toplevel ?? dir)
    const porcelain = runGit(dir, [
        'status',
        '--porcelain',
        '--untracked-files=no',
    ])
    const dirty = porcelain !== null && porcelain.length > 0
    const dirtyMark = dirty ? `${YELLOW}*${RESET}` : ''
    return `${BLUE}${repo}${RESET} ${DIM}⎇${RESET} ${MAGENTA}${branch}${RESET}${dirtyMark}`
}

/** Bytes of transcript tail to scan for the latest usage record. */
const TRANSCRIPT_TAIL_BYTES = 262_144

/**
 * Current context occupancy in tokens, derived from the most recent
 * main-chain assistant entry in the session transcript. Returns null
 * when the transcript is absent or carries no usage records (e.g. a
 * brand-new session).
 */
async function readContextTokens(
    transcriptPath: string | undefined,
): Promise<number | null> {
    if (!transcriptPath || !existsSync(transcriptPath)) return null
    try {
        const size = statSync(transcriptPath).size
        const start = Math.max(0, size - TRANSCRIPT_TAIL_BYTES)
        const tail = await Bun.file(transcriptPath).slice(start).text()
        const lines = tail.split('\n')
        // Drop the first line when we sliced mid-file — it's a fragment.
        if (start > 0) lines.shift()
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            const line = lines[i]?.trim()
            if (!line) continue
            let entry: {
                isSidechain?: boolean
                message?: {
                    usage?: {
                        input_tokens?: number
                        cache_read_input_tokens?: number
                        cache_creation_input_tokens?: number
                    }
                }
            }
            try {
                entry = JSON.parse(line)
            } catch {
                continue
            }
            // Subagent (sidechain) turns have their own context windows —
            // only main-chain usage reflects this session's occupancy.
            if (entry.isSidechain === true) continue
            const usage = entry.message?.usage
            if (usage === undefined || typeof usage.input_tokens !== 'number')
                continue
            return (
                usage.input_tokens +
                (usage.cache_read_input_tokens ?? 0) +
                (usage.cache_creation_input_tokens ?? 0)
            )
        }
    } catch {
        // Unreadable transcript — degrade to "no context info".
    }
    return null
}

/** Context-window size inferred from the model id. */
function contextLimit(modelId: string | undefined): number {
    return modelId !== undefined && modelId.includes('[1m]')
        ? 1_000_000
        : 200_000
}

/** `412k` / `1M` style token formatting. */
function formatTokens(n: number): string {
    if (n >= 1_000_000) {
        const millions = n / 1_000_000
        return `${Number.isInteger(millions) ? millions : millions.toFixed(1)}M`
    }
    return `${Math.round(n / 1_000)}k`
}

const BAR_SLOTS = 10

/**
 * Render the context-usage bar segment: a 10-slot bar plus percent and
 * `used/limit` token counts, colored by pressure.
 */
function contextSegment(used: number | null, limit: number): string {
    const pct =
        used === null
            ? 0
            : Math.min(100, Math.round((used / limit) * 100))
    const filled = Math.min(BAR_SLOTS, Math.round((pct / 100) * BAR_SLOTS))
    const color = pct >= 80 ? RED : pct >= 60 ? YELLOW : GREEN
    const bar =
        color +
        '█'.repeat(filled) +
        `${RESET}${DIM}` +
        '░'.repeat(BAR_SLOTS - filled) +
        RESET
    if (used === null) {
        return `${bar} ${DIM}ctx —${RESET}`
    }
    return `${bar} ${color}${pct}%${RESET} ${DIM}${formatTokens(used)}/${formatTokens(limit)}${RESET}`
}

/**
 * Build the luca pipeline segment from `<projectDir>/.luca/state.json`.
 * Returns null when the project is not luca-managed or the state file
 * is unreadable. Idle pipelines render dimmed so active steps stand out.
 */
async function lucaSegment(projectDir: string): Promise<string | null> {
    const statePath = join(projectDir, '.luca', 'state.json')
    if (!existsSync(statePath)) return null
    try {
        const state = (await Bun.file(statePath).json()) as {
            pipelineStep?: string
            currentPhase?: number
            totalPhases?: number
        }
        if (typeof state.pipelineStep !== 'string') return null
        const phase =
            typeof state.currentPhase === 'number' &&
            typeof state.totalPhases === 'number'
                ? ` ${state.currentPhase}/${state.totalPhases}`
                : ''
        if (state.pipelineStep === 'idle') {
            return `${DIM}luca:idle${phase}${RESET}`
        }
        return `${MAGENTA}luca:${state.pipelineStep}${RESET}${DIM}${phase}${RESET}`
    } catch {
        return null
    }
}

/** `+added/-removed` session line delta; null when both are zero/absent. */
function linesSegment(cost: StatuslinePayload['cost']): string | null {
    const added = cost?.total_lines_added ?? 0
    const removed = cost?.total_lines_removed ?? 0
    if (added === 0 && removed === 0) return null
    return `${GREEN}+${added}${RESET}${DIM}/${RESET}${RED}-${removed}${RESET}`
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    let payload: StatuslinePayload = {}
    try {
        const raw = await Bun.stdin.text()
        if (raw.trim()) payload = JSON.parse(raw) as StatuslinePayload
    } catch {
        // Malformed stdin — render what we can from defaults.
    }

    const dir =
        payload.workspace?.current_dir ?? payload.cwd ?? process.cwd()
    const projectDir = payload.workspace?.project_dir ?? dir

    const modelName =
        payload.model?.display_name ?? payload.model?.id ?? 'Claude'

    const used = await readContextTokens(payload.transcript_path)
    const limit = contextLimit(payload.model?.id)

    const segments = [
        `${CYAN}${modelName}${RESET}`,
        gitSegment(dir),
        contextSegment(used, limit),
        await lucaSegment(projectDir),
        linesSegment(payload.cost),
    ].filter((s): s is string => s !== null)

    console.log(segments.join(SEPARATOR))
}

main().catch(() => {
    // A statusline must never crash the harness — emit a minimal line.
    console.log('luca')
    process.exit(0)
})
