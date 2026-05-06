import { execFileSync } from 'node:child_process'

import { createTool } from '@mastra/core/tools'
import { z } from 'zod'

import { readLucaState, writeLucaState } from '../state/luca-store.js'

// ---------------------------------------------------------------------------
// Git helpers — thin, sync, never throw above this layer
// ---------------------------------------------------------------------------

interface GitResult {
    ok: boolean
    stdout: string
    stderr: string
}

interface GitOptions {
    /** Timeout in milliseconds. Pass to bound network-touching commands. */
    timeoutMs?: number
}

function git(args: readonly string[], opts: GitOptions = {}): GitResult {
    try {
        const stdout = execFileSync('git', args, {
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            ...(opts.timeoutMs !== undefined
                ? { timeout: opts.timeoutMs, killSignal: 'SIGTERM' as const }
                : {}),
        })
        return { ok: true, stdout: stdout.trim(), stderr: '' }
    } catch (err) {
        const e = err as {
            stdout?: Buffer
            stderr?: Buffer
            message?: string
            code?: string
            signal?: string
        }
        const timedOut =
            e.code === 'ETIMEDOUT' ||
            e.signal === 'SIGTERM' ||
            e.signal === 'SIGKILL'
        return {
            ok: false,
            stdout: e.stdout?.toString().trim() ?? '',
            stderr:
                e.stderr?.toString().trim() ??
                e.message ??
                (timedOut ? 'git command timed out' : 'git command failed'),
        }
    }
}

function isInsideGitRepo(): boolean {
    // `git rev-parse --is-inside-work-tree` can exit 0 while printing "false"
    // when run inside a `.git/` directory or a bare repo. Validate the stdout
    // so non-worktrees are correctly rejected before we touch any branch state.
    const r = git(['rev-parse', '--is-inside-work-tree'])
    return r.ok && r.stdout === 'true'
}

function currentBranch(): string {
    // Returns empty string for detached HEAD.
    const r = git(['branch', '--show-current'])
    return r.ok ? r.stdout : ''
}

function defaultBranch(): string {
    // Prefer origin/HEAD; fall back to common conventions.
    const sym = git(['symbolic-ref', 'refs/remotes/origin/HEAD'])
    if (sym.ok && sym.stdout.startsWith('refs/remotes/origin/')) {
        return sym.stdout.slice('refs/remotes/origin/'.length)
    }
    // Last-resort fallbacks — order matches industry preference.
    for (const candidate of ['main', 'master', 'trunk']) {
        if (git(['show-ref', '--verify', `refs/heads/${candidate}`]).ok) {
            return candidate
        }
    }
    return 'main'
}

function branchExistsLocal(name: string): boolean {
    return git(['show-ref', '--verify', `refs/heads/${name}`]).ok
}

/**
 * Check whether `<name>` exists on `origin`. Bounded by a timeout so an
 * unreachable remote can't hang the pipeline for ~75 s on TCP retries.
 * Returns `false` on timeout — callers see "no remote collision" rather than
 * a hang. The local-collision check still fires, so this fail-open is safe.
 */
function branchExistsRemote(name: string): boolean {
    const REMOTE_LS_TIMEOUT_MS = 5_000
    const r = git(['ls-remote', '--heads', 'origin', name], {
        timeoutMs: REMOTE_LS_TIMEOUT_MS,
    })
    return r.ok && r.stdout.length > 0
}

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------

const BRANCH_TYPES = [
    'feat',
    'fix',
    'refactor',
    'chore',
    'docs',
    'test',
    'style',
] as const
type BranchType = (typeof BRANCH_TYPES)[number]

/**
 * Conservative kebab-case slug. Strips anything that isn't alphanumeric or
 * a separator, collapses runs, trims length. Never returns an empty string —
 * falls back to "work" so we always have a usable branch suffix.
 */
function slugify(input: string): string {
    const cleaned = input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
    return cleaned.length > 0 ? cleaned : 'work'
}

function buildBranchName({
    type,
    issueNumber,
    slug,
}: {
    type: BranchType
    issueNumber?: number
    slug: string
}): string {
    const cleanSlug = slugify(slug)
    return issueNumber !== undefined
        ? `${type}/${issueNumber}-${cleanSlug}`
        : `${type}/${cleanSlug}`
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const ENSURE_FEATURE_BRANCH_ACTIONS = [
    'status',
    'create',
    'rename',
] as const

export const ensureFeatureBranchTool = createTool({
    id: 'ensure-feature-branch',
    description:
        'Manage the feature branch for the current pipeline run. Architect Step 1 calls action="create" to switch off the default branch onto `<type>/<issue>-<slug>` before any planning or execution. Executor and finalize use action="status" to verify the run is on a non-default branch before committing or opening a PR. Branch name and issue number are persisted to luca-state.json (branchName, issueNumber).',
    inputSchema: z.object({
        action: z
            .enum(ENSURE_FEATURE_BRANCH_ACTIONS)
            .describe(
                '"status" inspects the current branch vs the default branch (no side effects). "create" switches to (or creates) `<type>/<issue>-<slug>` from the default branch and persists branchName/issueNumber to state. "rename" renames the current branch in place.'
            ),
        type: z
            .enum(BRANCH_TYPES)
            .optional()
            .describe(
                'Conventional-commit type prefix used as the branch namespace. Required for "create" and "rename".'
            ),
        issueNumber: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
                'GitHub issue number to embed in the branch name. Optional — branches without an issue are allowed.'
            ),
        slug: z
            .string()
            .min(1)
            .optional()
            .describe(
                'Short kebab-cased description for the branch suffix. Required for "create" and "rename". Will be slugified defensively.'
            ),
        force: z
            .boolean()
            .default(false)
            .describe(
                'For "create": if true, switch to a fresh branch even when already on a non-default feature branch. Default false (idempotent no-op).'
            ),
    }),
    execute: async (inputData) => {
        const { action, type, issueNumber, slug, force } = inputData

        if (!isInsideGitRepo()) {
            return {
                ok: false as const,
                status: 'no-git' as const,
                message:
                    'Not inside a git work tree — cannot manage feature branches.',
            }
        }

        const current = currentBranch()
        const def = defaultBranch()

        // ── status ──────────────────────────────────────────────────
        if (action === 'status') {
            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'HEAD is detached — no current branch. The orchestrator must check out or create a feature branch before committing.',
                }
            }
            if (current === def) {
                return {
                    ok: false as const,
                    status: 'on-default' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `Refusing to proceed: HEAD is on the default branch '${current}'. Architect Step 1 must run \`ensureFeatureBranch\` with action="create" first.`,
                }
            }
            return {
                ok: true as const,
                status: 'on-feature' as const,
                currentBranch: current,
                defaultBranch: def,
                message: `On feature branch '${current}' (default: '${def}').`,
            }
        }

        // ── create ──────────────────────────────────────────────────
        if (action === 'create') {
            if (!type || !slug) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message:
                        'action="create" requires both `type` and `slug`. Optional: `issueNumber`.',
                }
            }

            // Detached HEAD is a hard stop — never create branches off an
            // unintended commit. Documented in architect.md as a stop condition.
            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'HEAD is detached — cannot create a feature branch from an unintended commit. Check out the default branch first.',
                }
            }

            // Already on a feature branch and not forcing → idempotent no-op.
            if (current !== '' && current !== def && !force) {
                // Persist whatever state we can infer, but don't overwrite
                // an existing branchName mismatch silently — surface it.
                const state = readLucaState()
                if (state.branchName && state.branchName !== current) {
                    return {
                        ok: false as const,
                        status: 'branch-mismatch' as const,
                        currentBranch: current,
                        defaultBranch: def,
                        recordedBranch: state.branchName,
                        message: `Already on '${current}', but luca-state recorded '${state.branchName}'. Resolve before continuing (set force=true to overwrite recorded branch).`,
                    }
                }
                writeLucaState({
                    branchName: current,
                    ...(issueNumber !== undefined ? { issueNumber } : {}),
                })
                return {
                    ok: true as const,
                    status: 'already-on-feature' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `Already on feature branch '${current}'. No new branch created.`,
                    created: false,
                }
            }

            // Build the target name and validate non-collision.
            const target = buildBranchName({ type, issueNumber, slug })

            if (branchExistsLocal(target)) {
                return {
                    ok: false as const,
                    status: 'local-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Local branch '${target}' already exists. Pick a different slug or check out the existing branch manually.`,
                }
            }
            if (branchExistsRemote(target)) {
                return {
                    ok: false as const,
                    status: 'remote-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Remote branch '${target}' already exists on origin. Pick a different slug or check out the existing branch manually.`,
                }
            }

            // Always create from the default branch. If we're somewhere else
            // (force=true on a non-default feature branch), switch to default
            // first so the new branch has a clean base — never the prior
            // feature branch's commits — matching the documented contract.
            if (current !== def) {
                const toDefault = git(['switch', def])
                if (!toDefault.ok) {
                    return {
                        ok: false as const,
                        status: 'git-error' as const,
                        currentBranch: current,
                        defaultBranch: def,
                        proposedBranch: target,
                        message: `git switch ${def} failed (could not return to default before branching): ${toDefault.stderr}`,
                    }
                }
            }

            const switched = git(['switch', '-c', target])
            if (!switched.ok) {
                return {
                    ok: false as const,
                    status: 'git-error' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `git switch -c failed: ${switched.stderr}`,
                }
            }

            writeLucaState({
                branchName: target,
                ...(issueNumber !== undefined ? { issueNumber } : {}),
            })

            return {
                ok: true as const,
                status: 'created' as const,
                currentBranch: target,
                defaultBranch: def,
                message: `Created and switched to '${target}' (from '${current || def}').`,
                created: true,
            }
        }

        // ── rename ──────────────────────────────────────────────────
        if (action === 'rename') {
            if (!type || !slug) {
                return {
                    ok: false as const,
                    status: 'invalid-args' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message:
                        'action="rename" requires both `type` and `slug`. Optional: `issueNumber`.',
                }
            }
            if (current === '') {
                return {
                    ok: false as const,
                    status: 'detached' as const,
                    currentBranch: '',
                    defaultBranch: def,
                    message:
                        'Cannot rename: HEAD is detached. Check out a feature branch first.',
                }
            }
            if (current === def) {
                return {
                    ok: false as const,
                    status: 'on-default' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `Cannot rename '${current}'. The default branch must never be renamed; create a feature branch first.`,
                }
            }
            const target = buildBranchName({ type, issueNumber, slug })
            if (target === current) {
                return {
                    ok: true as const,
                    status: 'noop' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    message: `Branch already named '${target}'.`,
                }
            }
            if (branchExistsLocal(target)) {
                return {
                    ok: false as const,
                    status: 'local-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Cannot rename: local branch '${target}' already exists.`,
                }
            }
            if (branchExistsRemote(target)) {
                return {
                    ok: false as const,
                    status: 'remote-collision' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `Cannot rename: remote branch '${target}' already exists on origin.`,
                }
            }
            const renamed = git(['branch', '-m', target])
            if (!renamed.ok) {
                return {
                    ok: false as const,
                    status: 'git-error' as const,
                    currentBranch: current,
                    defaultBranch: def,
                    proposedBranch: target,
                    message: `git branch -m failed: ${renamed.stderr}`,
                }
            }
            writeLucaState({
                branchName: target,
                ...(issueNumber !== undefined ? { issueNumber } : {}),
            })
            return {
                ok: true as const,
                status: 'renamed' as const,
                currentBranch: target,
                defaultBranch: def,
                message: `Renamed '${current}' → '${target}'.`,
            }
        }

        // Unreachable — zod enum guarantees exhaustiveness.
        return {
            ok: false as const,
            status: 'unknown-action' as const,
            message: `Unknown action: ${action}`,
        }
    },
})

// Exported for testing.
export const __testing = {
    slugify,
    buildBranchName,
}
